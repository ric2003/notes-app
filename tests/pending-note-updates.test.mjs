import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePendingUpdate,
  overlayPendingUpdates,
  parsePendingUpdates,
  removePersistedUpdate,
} from "../src/lib/pending-note-updates.ts";

test("new updates merge with fields that have not reached the server", () => {
  const position = { position_x: 120, position_y: 240 };
  const first = mergePendingUpdate(new Map(), "note-1", position);
  const second = mergePendingUpdate(first.next, "note-1", {
    content: "still here",
  });

  assert.deepEqual(second.merged, {
    position_x: 120,
    position_y: 240,
    content: "still here",
  });
});

test("an older request cannot clear a newer queued update", () => {
  const first = mergePendingUpdate(new Map(), "note-1", { content: "one" });
  const second = mergePendingUpdate(first.next, "note-1", { content: "two" });

  assert.equal(
    removePersistedUpdate(second.next, "note-1", first.merged),
    second.next,
  );
  assert.equal(
    removePersistedUpdate(second.next, "note-1", second.merged).size,
    0,
  );
});

test("pending fields overlay realtime snapshots and survive storage parsing", () => {
  const pending = parsePendingUpdates(
    JSON.stringify([["note-1", { position_x: 90, content: "local" }]]),
  );
  const notes = overlayPendingUpdates(
    [
      {
        id: "note-1",
        content: "remote",
        color: "yellow",
        position_x: 0,
        position_y: 0,
      },
    ],
    pending,
  );

  assert.equal(notes[0].content, "local");
  assert.equal(notes[0].position_x, 90);
  assert.equal(notes[0].position_y, 0);
});
