import assert from "node:assert/strict";
import test from "node:test";
import { NoteSync, NoteSaveError } from "../src/lib/note-sync.ts";
import { deleteNote } from "../src/lib/note-client.ts";

const note = {
  id: "n1",
  content: "original",
  color: "blue",
  position_x: 0,
  position_y: 0,
  width: 320,
  height: 224,
};
function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(options = {}, disk = storage()) {
  const sync = new NoteSync({
    save: async () => {},
    remove: async () => {},
    ...options,
  });
  sync.start(disk);
  sync.stop(); // Tests advance the queue explicitly without real timers.
  return { sync, disk };
}

test("overlapping edits and retries serialize writes and rebase the next content check", async () => {
  const first = deferred();
  const sent = [];
  const { sync } = setup({
    save: async (id, update) => {
      sent.push(update);
      if (sent.length === 1) await first.promise;
    },
  });
  sync.update("n1", { content: "one", expected_content: "original" });
  const a = sync.flush();
  await Promise.resolve();
  sync.update("n1", { content: "two", expected_content: "one" });
  const b = sync.flush();
  await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.equal(sync.getSnapshot().saving, 1);
  first.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(sent, [
    { content: "one", expected_content: "original" },
    { content: "two", expected_content: "one" },
  ]);
  assert.equal(sync.getSnapshot().pending, 0);
});

test("every edit is durable before a request, and a reload retries the latest text", async () => {
  const { sync, disk } = setup({
    save: async () => {
      throw Error("offline");
    },
  });
  sync.update("n1", { content: "draft", expected_content: "original" });
  assert.equal(
    JSON.parse(disk.getItem("notesAppPendingUpdates"))[0][1].content,
    "draft",
  );
  await sync.flush();
  assert.equal(sync.getSnapshot().pending, 1);
  const sent = [];
  const next = setup(
    { save: async (_, update) => sent.push(update) },
    disk,
  ).sync;
  assert.equal(next.merge([note])[0].content, "draft");
  await next.flush();
  assert.equal(sent[0].content, "draft");
  assert.equal(next.getSnapshot().pending, 0);
});

test("a conflict pauses retries and preserves both versions until an explicit choice", async () => {
  let calls = 0;
  const remote = { ...note, content: "someone else's text" };
  const { sync } = setup({
    save: async (_, update) => {
      calls++;
      if (update.expected_content !== remote.content)
        throw new NoteSaveError("Conflict", 409, remote);
    },
  });
  sync.update("n1", { content: "mine", expected_content: "original" });
  await sync.flush();
  await sync.flush();
  assert.equal(calls, 1);
  assert.equal(sync.getSnapshot().problems[0].updates.content, "mine");
  assert.equal(sync.getSnapshot().problems[0].remote.content, remote.content);
  sync.resolve("n1", true);
  await sync.flush();
  assert.equal(calls, 2);
  assert.equal(sync.getSnapshot().pending, 0);
});

test("using remote text keeps unrelated queued geometry", async () => {
  const { sync } = setup({
    save: async () => {
      throw new NoteSaveError("Conflict", 409, note);
    },
  });
  sync.update("n1", { content: "mine", expected_content: "old", width: 500 });
  await sync.flush();
  sync.resolve("n1", false);
  assert.equal(sync.merge([note])[0].content, "original");
  assert.equal(sync.merge([note])[0].width, 500);
});

test("deletion waits for an existing save and never sends later updates after delete", async () => {
  let now = 0;
  const save = deferred();
  const events = [];
  const { sync } = setup({
    now: () => now,
    save: async () => {
      events.push("save");
      await save.promise;
    },
    remove: async () => events.push("delete"),
  });
  sync.update("n1", { content: "draft" });
  const running = sync.flush();
  await Promise.resolve();
  sync.delete(note);
  sync.update("n1", { content: "ignored" });
  now = 6001;
  const deletion = sync.flush();
  assert.deepEqual(events, ["save"]);
  save.resolve();
  await Promise.all([running, deletion]);
  assert.deepEqual(events, ["save", "delete"]);
  assert.equal(sync.getSnapshot().pending, 0);
  assert.deepEqual(sync.merge([note]), []);
});

test("undo restores a note without deleting it and preserves queued edits", async () => {
  let deletes = 0;
  const { sync } = setup({ now: () => 0, remove: async () => deletes++ });
  sync.update("n1", { content: "draft" });
  sync.delete(note);
  assert.deepEqual(sync.merge([note]), []);
  sync.undoDelete("n1");
  assert.equal(sync.merge([note])[0].content, "draft");
  await sync.flush();
  assert.equal(deletes, 0);
});

test("a delete survives reload, respects its deadline, and restores the note on HTTP failure", async () => {
  let now = 0;
  const { sync, disk } = setup({ now: () => now });
  sync.delete(note);
  let calls = 0;
  const next = setup(
    {
      now: () => now,
      remove: async () => {
        if (++calls === 1) throw Error("HTTP 500");
      },
    },
    disk,
  ).sync;
  await next.flush();
  assert.equal(calls, 0);
  now = 6001;
  await next.flush();
  assert.equal(next.getSnapshot().failedDeletes.length, 1);
  assert.equal(next.merge([])[0].id, "n1");
  await next.flush();
  assert.equal(calls, 1, "failed deletion requires explicit retry");
  next.retryDelete("n1");
  await next.flush();
  assert.equal(calls, 2);
  assert.deepEqual(next.merge([note]), []);
});

test("deleted notes stop retrying and retain unsynced text for recovery", async () => {
  const { sync } = setup({
    save: async () => {
      throw new NoteSaveError("Deleted", 404);
    },
  });
  sync.update("n1", { content: "recover me" });
  await sync.flush();
  assert.equal(sync.getSnapshot().problems[0].updates.content, "recover me");
});

test("storage failure is visible while in-memory edits can still save", async () => {
  const { sync } = setup(
    {},
    {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    },
  );
  sync.update("n1", { content: "draft" });
  assert.equal(sync.getSnapshot().storageError, true);
  await sync.flush();
  assert.equal(sync.getSnapshot().pending, 0);
});

test("delete client rejects HTTP errors instead of claiming success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("error", { status: 500 });
  try {
    await assert.rejects(deleteNote("n1"), /500/);
  } finally {
    globalThis.fetch = original;
  }
});

test("a slow note does not block saves to another note", async () => {
  const slow = deferred();
  const saved = [];
  const { sync } = setup({
    save: async (id) => {
      if (id === "n1") await slow.promise;
      saved.push(id);
    },
  });
  sync.update("n1", { content: "slow" });
  sync.update("n2", { content: "fast" });
  const flushing = sync.flush();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(saved, ["n2"]);
  slow.resolve();
  await flushing;
  assert.deepEqual(saved, ["n2", "n1"]);
});

test("editing a restored note dismisses its failed deletion and allows saves", async () => {
  let now = 0;
  const sent = [];
  const { sync } = setup({
    now: () => now,
    remove: async () => {
      throw Error("offline");
    },
    save: async (_, update) => sent.push(update),
  });
  sync.delete(note);
  now = 6001;
  await sync.flush();
  sync.update("n1", { content: "keep this", expected_content: "original" });
  await sync.flush();
  assert.equal(sync.getSnapshot().failedDeletes.length, 0);
  assert.equal(sent[0].content, "keep this");
});

test("a conflicted draft is rechecked after reload rather than overwritten", async () => {
  const save = async () => {
    throw new NoteSaveError("Conflict", 409, note);
  };
  const { sync, disk } = setup({ save });
  sync.update("n1", { content: "mine", expected_content: "old" });
  await sync.flush();
  const restored = setup({ save }, disk).sync;
  await restored.flush();
  assert.equal(restored.getSnapshot().problems[0].updates.content, "mine");
  assert.equal(restored.getSnapshot().problems[0].remote.content, "original");
});
