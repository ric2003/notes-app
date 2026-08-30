import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateContentFit,
  calculateNoteResize,
  calculatePinchTransform,
  CANVAS_NOTE_HEIGHT,
  CANVAS_NOTE_WIDTH,
  distanceBetween,
  getNoteBounds,
  getNoteCenter,
  MAX_NOTE_HEIGHT,
  MAX_NOTE_WIDTH,
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH,
  midpointBetween,
} from "../src/lib/canvas-geometry.ts";

test("pinch zoom keeps the original world point under the gesture center", () => {
  const result = calculatePinchTransform({
    startDistance: 200,
    currentDistance: 100,
    startZoom: 1,
    startPan: { x: 20, y: -30 },
    startCenter: { x: 180, y: 320 },
    currentCenter: { x: 180, y: 320 },
    sensitivity: 1,
  });

  assert.equal(result.zoom, 0.5);
  assert.deepEqual(result.pan, { x: 100, y: 145 });
  assert.equal((180 - result.pan.x) / result.zoom, 160);
  assert.equal((320 - result.pan.y) / result.zoom, 350);
});

test("moving both fingers pans without changing zoom", () => {
  const result = calculatePinchTransform({
    startDistance: 120,
    currentDistance: 120,
    startZoom: 0.75,
    startPan: { x: 10, y: 15 },
    startCenter: { x: 100, y: 200 },
    currentCenter: { x: 130, y: 160 },
  });

  assert.equal(result.zoom, 0.75);
  assert.deepEqual(result.pan, { x: 40, y: -25 });
});

test("pinch helpers measure two touch points", () => {
  const first = { x: 20, y: 40 };
  const second = { x: 140, y: 90 };

  assert.equal(distanceBetween(first, second), 130);
  assert.deepEqual(midpointBetween(first, second), { x: 80, y: 65 });
});

test("pinch zoom clamps at the canvas limits without losing the anchor", () => {
  const minimum = calculatePinchTransform({
    startDistance: 200,
    currentDistance: 1,
    startZoom: 0.5,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 100, y: 100 },
    currentCenter: { x: 100, y: 100 },
    sensitivity: 1,
  });
  const maximum = calculatePinchTransform({
    startDistance: 20,
    currentDistance: 200,
    startZoom: 0.5,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 100, y: 100 },
    currentCenter: { x: 100, y: 100 },
    sensitivity: 1,
  });

  assert.equal(minimum.zoom, 0.01);
  assert.equal((100 - minimum.pan.x) / minimum.zoom, 200);
  assert.equal(maximum.zoom, 1);
  assert.equal((100 - maximum.pan.x) / maximum.zoom, 200);
});

test("invalid pinch snapshots return a finite safe transform", () => {
  const invalidZoom = calculatePinchTransform({
    startDistance: 100,
    currentDistance: 50,
    startZoom: Number.NaN,
    startPan: { x: 12, y: 34 },
    startCenter: { x: 100, y: 100 },
    currentCenter: { x: 100, y: 100 },
  });
  const zeroDistance = calculatePinchTransform({
    startDistance: 0,
    currentDistance: 50,
    startZoom: 0.5,
    startPan: { x: 12, y: 34 },
    startCenter: { x: 100, y: 100 },
    currentCenter: { x: 100, y: 100 },
  });

  assert.deepEqual(invalidZoom, { zoom: 0.01, pan: { x: 12, y: 34 } });
  assert.deepEqual(zeroDistance, { zoom: 0.5, pan: { x: 12, y: 34 } });
});

test("fit-to-content uses one scale for clamping and centering", () => {
  const fit = calculateContentFit({
    items: [
      { x: -10_000, y: -5_000, width: 320, height: 224 },
      { x: 11_450, y: 5_800, width: 640, height: 400 },
    ],
    viewportWidth: 320,
    viewportHeight: 568,
  });

  assert.ok(fit);
  assert.ok(fit.zoom > 0.01 && fit.zoom < 0.02);

  const left = (-10_000 - 100) * fit.zoom + fit.pan.x;
  const right = (11_450 + 640 + 100) * fit.zoom + fit.pan.x;
  assert.ok(left >= -0.001);
  assert.ok(right <= 320.001);
  assert.ok(Math.abs((left + right) / 2 - 160) < 0.001);
});

test("note resize uses world-coordinate deltas and clamps its result", () => {
  assert.deepEqual(
    calculateNoteResize({
      startSize: { width: 320, height: 224 },
      startPointer: { x: 800, y: 500 },
      currentPointer: { x: 960, y: 620 },
    }),
    { width: 480, height: 344 },
  );
  assert.deepEqual(
    calculateNoteResize({
      startSize: { width: 320, height: 224 },
      startPointer: { x: 800, y: 500 },
      currentPointer: { x: -10_000, y: 20_000 },
    }),
    { width: MIN_NOTE_WIDTH, height: MAX_NOTE_HEIGHT },
  );
  assert.equal(MAX_NOTE_WIDTH, 960);
  assert.equal(MIN_NOTE_HEIGHT, 180);
});

test("note bounds default legacy sizes and calculate the actual center", () => {
  const legacy = getNoteBounds({ position_x: 40, position_y: -20 });
  const resized = {
    position_x: 100,
    position_y: 200,
    width: 600,
    height: 360,
  };

  assert.deepEqual(legacy, {
    x: 40,
    y: -20,
    width: CANVAS_NOTE_WIDTH,
    height: CANVAS_NOTE_HEIGHT,
  });
  assert.deepEqual(getNoteCenter(resized), { x: 400, y: 380 });
  assert.equal(MAX_NOTE_WIDTH, 960);
});
