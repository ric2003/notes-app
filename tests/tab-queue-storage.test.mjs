import test from "node:test";
import assert from "node:assert/strict";
import { acquireQueue } from "../src/lib/tab-queue-storage.ts";
function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
function locks() {
  const held = new Set();
  return {
    async request(name, options, fn) {
      if (typeof options === "function") {
        fn = options;
        options = {};
      }
      if (held.has(name)) return fn(null);
      held.add(name);
      try {
        return await fn({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}
test("tabs have separate durable queues and duplicated tab IDs cannot share a live queue", async () => {
  const local = storage(),
    a = storage(),
    b = storage(),
    lock = locks();
  let serial = 0;
  const opts = (session) => ({
    local,
    session,
    locks: lock,
    uuid: () => String(++serial),
  });
  const first = await acquireQueue(opts(a));
  first.storage.setItem(
    "notesAppPendingUpdates",
    '[["n1",{"content":"first"}]]',
  );
  b.setItem("notesQueueId", first.id);
  const second = await acquireQueue(opts(b));
  assert.notEqual(first.id, second.id);
  second.storage.setItem("notesAppPendingUpdates", "[]");
  assert.match(first.storage.getItem("notesAppPendingUpdates"), /first/);
  first.release();
  second.release();
});
test("a closed tab queue is recovered, but a live queue is skipped", async () => {
  const local = storage(),
    lock = locks();
  let serial = 0;
  const opts = () => ({
    local,
    session: storage(),
    locks: lock,
    uuid: () => String(++serial),
  });
  const first = await acquireQueue(opts());
  first.storage.setItem(
    "notesAppPendingUpdates",
    '[["n1",{"content":"recover"}]]',
  );
  assert.equal(await acquireQueue(opts(), true), null);
  first.release();
  await Promise.resolve();
  await Promise.resolve();
  const recovered = await acquireQueue(opts(), true);
  assert.equal(recovered.id, first.id);
  assert.match(recovered.storage.getItem("notesAppPendingUpdates"), /recover/);
  recovered.release();
});
test("release one queues migrate once without overwriting existing tab work", async () => {
  const local = storage();
  local.setItem("notesAppPendingUpdates", '[["n1",{"content":"legacy"}]]');
  const opts = { local, session: storage(), locks: locks(), uuid: () => "one" };
  const lease = await acquireQueue(opts);
  assert.match(lease.storage.getItem("notesAppPendingUpdates"), /legacy/);
  assert.equal(local.getItem("notesAppPendingUpdates"), null);
  lease.release();
});
