import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

let appUrl = process.env.MOBILE_GESTURE_URL ?? "http://127.0.0.1:3000";
const viewport = { width: 390, height: 844 };

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a debugging port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function retry(action, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function ensureAppServer() {
  try {
    const response = await fetch(appUrl);
    if (response.ok) return null;
  } catch {}

  if (process.env.MOBILE_GESTURE_URL) {
    throw new Error(`The app is not reachable at ${appUrl}`);
  }

  const port = await getFreePort();
  appUrl = `http://127.0.0.1:${port}`;
  const nextBinary = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const server = spawn(
    process.execPath,
    [nextBinary, "dev", "--turbopack", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const rememberOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-8_000);
  };
  server.stdout.on("data", rememberOutput);
  server.stderr.on("data", rememberOutput);

  try {
    await retry(async () => {
      if (server.exitCode !== null) {
        throw new Error(`Next.js exited with ${server.exitCode}\n${output}`);
      }
      const response = await fetch(appUrl);
      if (!response.ok) throw new Error(`Next.js returned ${response.status}`);
    }, 30_000);
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }
  return server;
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  close() {
    this.socket.close();
  }
}

async function inspect(client, expected = null) {
  const { result } = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(() => {
      const expected = ${JSON.stringify(expected)};
      const notes = [...document.querySelectorAll('.note-container')];
      const layer = notes[0]?.parentElement;
      if (!layer) throw new Error('Notes canvas did not render');

      const visibleNotes = notes
        .map((note, index) => ({ note, index, rect: note.getBoundingClientRect() }))
        .filter(({ rect }) =>
          rect.right > 24 && rect.left < innerWidth - 24 &&
          rect.bottom > 80 && rect.top < innerHeight - 100
        );
      if (!expected && !visibleNotes.length) throw new Error('No note is visible in the mobile viewport');

      const candidate = expected
        ? {
            note: notes.find((note) => note.dataset.noteId === expected.noteId),
            index: notes.findIndex((note) => note.dataset.noteId === expected.noteId),
            rect: notes.find((note) => note.dataset.noteId === expected.noteId)?.getBoundingClientRect(),
          }
        : visibleNotes.sort((a, b) => {
        const area = (rect) =>
          Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) *
          Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
        return area(b.rect) - area(a.rect);
      })[0];
      if (!candidate?.note) throw new Error('The pinched note disappeared');

      const bounds = candidate.rect;
      const notePoints = [];
      if (!expected) {
        for (let y = Math.max(88, bounds.top + 56); y < Math.min(innerHeight - 110, bounds.bottom - 36); y += 24) {
        for (let x = Math.max(6, bounds.left + 6); x < Math.min(innerWidth - 6, bounds.right - 6); x += 24) {
            const target = document.elementFromPoint(x, y);
          if (target?.closest('.note-container') === candidate.note && !target.closest('button, input, textarea, [role="button"]')) {
              notePoints.push({ x, y });
            }
          }
        }
      }
      if (!expected && !notePoints.length) throw new Error('Could not find a safe touch point on a visible note');

      const blankPoints = [];
      if (!expected) {
        for (let y = 96; y < innerHeight - 120; y += 32) {
          for (let x = 24; x < innerWidth - 24; x += 32) {
            const target = document.elementFromPoint(x, y);
            if (target && !target.closest('.note-container, button, input, textarea, [role="dialog"]')) {
              blankPoints.push({ x, y });
            }
          }
        }
      }

      let pair = null;
      if (!expected) {
        for (const first of notePoints) {
          for (const second of blankPoints) {
            const distance = Math.hypot(second.x - first.x, second.y - first.y);
            if (distance >= 120 && distance <= 240 && (!pair || distance > pair.distance)) {
              pair = { first, second, distance };
            }
          }
        }
      }
      if (!expected && !pair) throw new Error('Could not find note and canvas points for a pinch');

      const matrix = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
      const midpoint = expected?.midpoint ?? {
        x: (pair.first.x + pair.second.x) / 2,
        y: (pair.first.y + pair.second.y) / 2,
      };

      return {
        noteId: candidate.note.dataset.noteId,
        noteIndex: candidate.index,
        noteTransform: candidate.note.style.transform,
        layerTransform: layer.style.transform,
        scale: matrix.a,
        translation: { x: matrix.e, y: matrix.f },
        midpoint,
        worldAtMidpoint: {
          x: (midpoint.x - matrix.e) / matrix.a,
          y: (midpoint.y - matrix.f) / matrix.d,
        },
        points: pair,
      };
    })()`,
  });
  return result.value;
}

async function dispatchTouch(client, type, points) {
  await client.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point, index) => ({
      x: point.x,
      y: point.y,
      id: point.id ?? index + 1,
      radiusX: 2,
      radiusY: 2,
      force: 1,
    })),
  });
}

async function setOffline(client, offline) {
  await client.send("Network.emulateNetworkConditions", {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  });
}

async function loadFixture(client) {
  await setOffline(client, false);
  await client.send("Page.navigate", { url: appUrl });
  await retry(async () => {
    const { result } = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `document.readyState === 'complete' &&
        document.querySelector('[data-note-id="mobile-gesture-fixture"]') !== null`,
    });
    if (!result.value)
      throw new Error("Waiting for the gesture fixture to render");
  }, 20_000);
  await new Promise((resolve) => setTimeout(resolve, 150));

  const before = await inspect(client);
  if (before.noteId !== "mobile-gesture-fixture") {
    throw new Error(
      `Expected the isolated gesture fixture, found ${before.noteId}`,
    );
  }
  await setOffline(client, true);
  return before;
}

async function runScenario(client, options) {
  const before = await loadFixture(client);
  const firstBase =
    options.firstTouch === "note" ? before.points.first : before.points.second;
  const secondBase =
    options.firstTouch === "note" ? before.points.second : before.points.first;
  const first = { ...firstBase, id: 1 };
  const second = { ...secondBase, id: 2 };
  const startMidpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };

  await dispatchTouch(client, "touchStart", [first]);
  await new Promise((resolve) => setTimeout(resolve, 35));
  await dispatchTouch(client, "touchStart", [first, second]);

  let currentFirst = first;
  let currentSecond = second;
  for (let step = 1; step <= 6; step += 1) {
    const progress = step / 6;
    const ratio = 1 - step * 0.1;
    const shift = {
      x: options.translation.x * progress,
      y: options.translation.y * progress,
    };
    currentFirst = {
      id: 1,
      x: startMidpoint.x + shift.x + (first.x - startMidpoint.x) * ratio,
      y: startMidpoint.y + shift.y + (first.y - startMidpoint.y) * ratio,
    };
    currentSecond = {
      id: 2,
      x: startMidpoint.x + shift.x + (second.x - startMidpoint.x) * ratio,
      y: startMidpoint.y + shift.y + (second.y - startMidpoint.y) * ratio,
    };
    await dispatchTouch(client, "touchMove", [currentFirst, currentSecond]);
  }

  await dispatchTouch(client, "touchEnd", []);
  await new Promise((resolve) => setTimeout(resolve, 100));

  const finalMidpoint = {
    x: startMidpoint.x + options.translation.x,
    y: startMidpoint.y + options.translation.y,
  };
  const after = await inspect(client, {
    noteId: before.noteId,
    midpoint: finalMidpoint,
  });
  const anchorDrift = Math.hypot(
    after.worldAtMidpoint.x - before.worldAtMidpoint.x,
    after.worldAtMidpoint.y - before.worldAtMidpoint.y,
  );
  const noteMoved = after.noteTransform !== before.noteTransform;
  const zoomedOut = after.scale < before.scale - 0.05;
  const report = {
    scenario: options.name,
    zoom: `${before.scale.toFixed(3)} -> ${after.scale.toFixed(3)}`,
    camera: `${before.layerTransform} -> ${after.layerTransform}`,
    anchorDrift: Number(anchorDrift.toFixed(2)),
    noteMoved,
    note: `${before.noteTransform} -> ${after.noteTransform}`,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!zoomedOut) {
    throw new Error(`${options.name}: pinching inward did not zoom out`);
  }
  if (anchorDrift > 3) {
    throw new Error(
      `${options.name}: the map drifted ${anchorDrift.toFixed(1)} canvas pixels`,
    );
  }
  if (noteMoved) {
    throw new Error(`${options.name}: a note moved with the pinch gesture`);
  }
  console.log(`PASS: ${options.name}`);
}

async function runTwoToOneSuppressionCheck(client) {
  const before = await loadFixture(client);
  const { result } = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const notePoint = ${JSON.stringify(before.points.first)};
      const canvasPoint = ${JSON.stringify(before.points.second)};
      const note = document.querySelector('[data-note-id="${before.noteId}"]');
      const layer = note.parentElement;
      const outer = layer.parentElement.parentElement;
      const noteTarget = document.elementFromPoint(notePoint.x, notePoint.y);
      const canvasTarget = document.elementFromPoint(canvasPoint.x, canvasPoint.y);
      const emit = (target, type, pointerId, point) => target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 101,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: point.x,
          clientY: point.y,
        }),
      );
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

      emit(noteTarget, 'pointerdown', 101, notePoint);
      await new Promise((resolve) => setTimeout(resolve, 35));
      emit(canvasTarget, 'pointerdown', 102, canvasPoint);

      const center = {
        x: (notePoint.x + canvasPoint.x) / 2,
        y: (notePoint.y + canvasPoint.y) / 2,
      };
      const firstMoved = {
        x: center.x + (notePoint.x - center.x) * 0.75,
        y: center.y + (notePoint.y - center.y) * 0.75,
      };
      const secondMoved = {
        x: center.x + (canvasPoint.x - center.x) * 0.75,
        y: center.y + (canvasPoint.y - center.y) * 0.75,
      };
      emit(outer, 'pointermove', 101, firstMoved);
      emit(outer, 'pointermove', 102, secondMoved);
      await nextFrame();
      await nextFrame();

      emit(outer, 'pointerup', 102, secondMoved);
      const transformAfterLift = layer.style.transform;
      const noteAfterLift = note.style.transform;
      emit(outer, 'pointermove', 101, {
        x: firstMoved.x + 40,
        y: firstMoved.y + 24,
      });
      await nextFrame();
      await nextFrame();
      const transformAfterMove = layer.style.transform;
      const noteAfterMove = note.style.transform;
      emit(outer, 'pointerup', 101, firstMoved);

      return {
        transformAfterLift,
        transformAfterMove,
        noteAfterLift,
        noteAfterMove,
      };
    })()`,
  });
  const state = result.value;
  if (state.transformAfterMove !== state.transformAfterLift) {
    throw new Error("the remaining finger restarted a stale canvas pan");
  }
  if (state.noteAfterMove !== state.noteAfterLift) {
    throw new Error("the remaining finger restarted a stale note drag");
  }
  console.log("PASS: 2-to-1 touch transition stays suppressed until release");
}

async function runSingleFingerChecks(client) {
  let before = await loadFixture(client);
  const notePoint = { ...before.points.first, id: 1 };
  await dispatchTouch(client, "touchStart", [notePoint]);
  await new Promise((resolve) => setTimeout(resolve, 35));
  await dispatchTouch(client, "touchMove", [
    { ...notePoint, x: notePoint.x + 30, y: notePoint.y + 20 },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await dispatchTouch(client, "touchEnd", []);
  await new Promise((resolve) => setTimeout(resolve, 80));
  let after = await inspect(client, {
    noteId: before.noteId,
    midpoint: before.midpoint,
  });
  if (after.noteTransform === before.noteTransform) {
    throw new Error("single-finger note drag did not move the note");
  }
  if (after.layerTransform !== before.layerTransform) {
    throw new Error("single-finger note drag moved the camera");
  }
  console.log("PASS: single-finger note drag still works");

  before = await loadFixture(client);
  const canvasPoint = { ...before.points.second, id: 1 };
  await dispatchTouch(client, "touchStart", [canvasPoint]);
  await new Promise((resolve) => setTimeout(resolve, 35));
  await dispatchTouch(client, "touchMove", [
    { ...canvasPoint, x: canvasPoint.x + 32, y: canvasPoint.y + 24 },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await dispatchTouch(client, "touchEnd", []);
  await new Promise((resolve) => setTimeout(resolve, 80));
  after = await inspect(client, {
    noteId: before.noteId,
    midpoint: before.midpoint,
  });
  if (after.layerTransform === before.layerTransform) {
    throw new Error("single-finger canvas pan did not move the camera");
  }
  if (after.noteTransform !== before.noteTransform) {
    throw new Error("single-finger canvas pan changed a note's world position");
  }
  console.log("PASS: single-finger canvas pan still works");
}

async function runMobileLayoutChecks(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await loadFixture(client);

  const { result: controlResult } = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const visible = (element) => element && element.getBoundingClientRect().width > 0;
      const zoomControls = [...document.querySelectorAll('[aria-label="Canvas zoom controls"]')].find(visible);
      const note = document.querySelector('[data-note-id="mobile-gesture-fixture"]');
      const createButton = document.querySelector('[aria-label="Create note"]');
      const accountButton = document.querySelector('[aria-label="Sign in"]');
      const sizes = [
        createButton,
        accountButton,
        ...zoomControls.querySelectorAll('button'),
        ...note.querySelectorAll('button'),
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      accountButton.click();
      return { sizes, zoomButtonCount: zoomControls.querySelectorAll('button').length };
    })()`,
  });

  await retry(async () => {
    const { result } = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: "document.querySelector('[role=dialog]') !== null",
    });
    if (!result.value) throw new Error("Waiting for the mobile account sheet");
  });

  const { result: dialogResult } = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const rect = dialog.getBoundingClientRect();
      const inputs = [...dialog.querySelectorAll('input')].map((input) => ({
        height: input.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
      }));
      const closeButton = dialog.querySelector('[aria-label="Close account access"]');
      const closeRect = closeButton.getBoundingClientRect();
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: innerWidth, height: innerHeight },
        inputs,
        closeButton: { width: closeRect.width, height: closeRect.height },
        coversBottomControls:
          document.elementFromPoint(innerWidth / 2, innerHeight - 24)?.closest('[role="dialog"]') === dialog,
        clientHeight: dialog.clientHeight,
        scrollHeight: dialog.scrollHeight,
      };
    })()`,
  });

  const controls = controlResult.value;
  const dialog = dialogResult.value;
  const smallestTarget = Math.min(
    ...controls.sizes.flatMap((size) => [size.width, size.height]),
  );
  if (controls.zoomButtonCount !== 4 || smallestTarget < 43.5) {
    throw new Error(
      `mobile controls include a ${smallestTarget.toFixed(1)}px touch target`,
    );
  }
  if (
    Math.abs(dialog.rect.left) > 0.5 ||
    Math.abs(dialog.rect.right - dialog.viewport.width) > 0.5 ||
    Math.abs(dialog.rect.top) > 0.5 ||
    Math.abs(dialog.rect.bottom - dialog.viewport.height) > 0.5 ||
    !dialog.coversBottomControls
  ) {
    throw new Error(
      `the mobile account view does not fully cover the canvas: ${JSON.stringify(dialog)}`,
    );
  }
  if (
    dialog.inputs.some(
      (input) => input.height < 43.5 || input.fontSize < 15.5,
    ) ||
    dialog.closeButton.width < 43.5 ||
    dialog.closeButton.height < 43.5
  ) {
    throw new Error(
      `mobile account inputs are too small: ${JSON.stringify(dialog.inputs)}`,
    );
  }
  console.log("PASS: full-screen mobile account view covers canvas controls");

  const { result: minimapButtonResult } = await client.send(
    "Runtime.evaluate",
    {
      returnByValue: true,
      expression: `(() => {
        document.querySelector('[aria-label="Close account access"]')?.click();
        const button = document.querySelector('[aria-label="Open board minimap"]');
        const zoom = [...document.querySelectorAll('[aria-label="Canvas zoom controls"]')]
          .find((element) => element.getBoundingClientRect().width > 0);
        if (!button || !zoom) return null;
        const rect = button.getBoundingClientRect();
        const zoomRect = zoom.getBoundingClientRect();
        button.click();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          bottom: rect.bottom,
          zoomRight: zoomRect.right,
          zoomBottom: zoomRect.bottom,
          zoomHeight: zoomRect.height,
        };
      })()`,
    },
  );
  const button = minimapButtonResult.value;
  if (
    !button ||
    button.width < 43.5 ||
    button.height < 43.5 ||
    button.left - button.zoomRight < 4 ||
    button.left - button.zoomRight > 12 ||
    Math.abs(button.bottom - button.zoomBottom) > 1 ||
    Math.abs(button.height - button.zoomHeight) > 1
  ) {
    throw new Error(
      `mobile minimap toggle is unavailable or too small: ${JSON.stringify(button)}`,
    );
  }

  const minimap = await retry(async () => {
    const { result } = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const map = document.querySelector('[data-mobile-minimap]');
        const button = document.querySelector('[aria-label="Close board minimap"]');
        if (!map || !button) return null;
        const rect = map.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          buttonTop: buttonRect.top,
          viewport: { width: innerWidth, height: innerHeight },
        };
      })()`,
    });
    if (!result.value) throw new Error("Waiting for the mobile minimap");
    return result.value;
  });
  if (
    minimap.left < 0 ||
    minimap.top < 0 ||
    minimap.right > minimap.viewport.width ||
    minimap.bottom > minimap.viewport.height ||
    minimap.bottom > minimap.buttonTop
  ) {
    throw new Error(
      `mobile minimap is unavailable or clipped: ${JSON.stringify(minimap)}`,
    );
  }
  console.log("PASS: mobile minimap sits beside the zoom bar and opens upward");

  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

async function runLandscapeTouchLayoutChecks(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await loadFixture(client);

  const { result } = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const note = document.querySelector('[data-note-id="mobile-gesture-fixture"]');
      const noteButtons = [...note.querySelectorAll('button')];
      const sizes = noteButtons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      const zoomControls = [...document.querySelectorAll('[aria-label="Canvas zoom controls"]')].filter(visible);

      note.querySelector('[aria-label="Edit note"]').click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const textarea = note.querySelector('textarea');
      const editorFontSize = Number.parseFloat(getComputedStyle(textarea).fontSize);

      document.querySelector('[aria-label="Sign in"]').click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const authFontSizes = [...document.querySelectorAll('[role="dialog"] input')]
        .map((input) => Number.parseFloat(getComputedStyle(input).fontSize));

      return {
        sizes,
        zoomControlCount: zoomControls.length,
        zoomControlTop: zoomControls[0]?.getBoundingClientRect().top,
        editorFontSize,
        authFontSizes,
      };
    })()`,
  });

  const layout = result.value;
  const smallestTarget = Math.min(
    ...layout.sizes.flatMap((size) => [size.width, size.height]),
  );
  if (smallestTarget < 43.5) {
    throw new Error(
      `landscape touch controls include a ${smallestTarget.toFixed(1)}px target`,
    );
  }
  if (layout.zoomControlCount !== 1 || layout.zoomControlTop < 250) {
    throw new Error(
      "landscape touch mode did not keep the bottom zoom toolbar",
    );
  }
  if (
    layout.editorFontSize < 15.5 ||
    layout.authFontSizes.some((fontSize) => fontSize < 15.5)
  ) {
    throw new Error(
      `landscape touch inputs can trigger focus zoom: ${JSON.stringify(layout)}`,
    );
  }
  console.log("PASS: landscape touch targets and inputs stay mobile-sized");

  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

async function main() {
  if (typeof WebSocket === "undefined") {
    throw new Error("The mobile browser check requires Node.js 22 or newer");
  }
  let appServer;
  let browser;
  let client;
  let profileDir;
  try {
    appServer = await ensureAppServer();
    const debugPort = await getFreePort();
    profileDir = await mkdtemp(path.join(os.tmpdir(), "notes-mobile-gesture-"));
    browser = spawn(
      "chromium",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-background-networking",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    const targets = await retry(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!response.ok) throw new Error(`DevTools returned ${response.status}`);
      const list = await response.json();
      if (!list.some((target) => target.type === "page"))
        throw new Error("No page target yet");
      return list;
    });
    const target = targets.find((item) => item.type === "page");
    client = new CdpClient(target.webSocketDebuggerUrl);

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Network.setBlockedURLs", {
      urls: [
        "*firebaseio.com/*",
        "*firebasedatabase.app/*",
        "*firebaseapp.com/*",
        "*googleapis.com/*",
      ],
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__NOTES_CANVAS_TEST_NOTES__ = [{
        id: 'mobile-gesture-fixture',
        content: 'Mobile gesture fixture',
        color: 'blue',
        position_x: 35,
        position_y: 180,
        created_at: '2026-01-01T00:00:00.000Z',
        user_name: 'Test user',
      }];`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await client.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await runMobileLayoutChecks(client);
    await runLandscapeTouchLayoutChecks(client);
    await runSingleFingerChecks(client);
    await runTwoToOneSuppressionCheck(client);
    await runScenario(client, {
      name: "note-first pinch keeps the note fixed",
      firstTouch: "note",
      translation: { x: 0, y: 0 },
    });
    await runScenario(client, {
      name: "canvas-first translated pinch keeps the camera anchored",
      firstTouch: "canvas",
      translation: { x: 28, y: 18 },
    });
  } finally {
    client?.close();
    if (browser?.exitCode === null) {
      const exited = new Promise((resolve) => browser.once("exit", resolve));
      browser.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    if (profileDir) {
      await rm(profileDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
    if (appServer?.exitCode === null) {
      const exited = new Promise((resolve) => appServer.once("exit", resolve));
      appServer.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
