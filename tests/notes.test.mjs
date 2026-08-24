import assert from "node:assert/strict";
import test from "node:test";

import {
  isReservedNoteId,
  normalizeNotesCollection,
  normalizeUserPhotoUrl,
} from "../src/lib/notes.ts";

test("presence and malformed records never become canvas notes", () => {
  const notes = normalizeNotesCollection({
    presence: {
      onlineUser: { id: "onlineUser", name: "Guest", online: true },
      position_x: 900,
      position_y: -400,
      edited_at: 1_700_000_000_000,
    },
    realNote: {
      content: "Keep me",
      color: "purple",
      position_x: 120,
      position_y: 240,
      created_at: 1_700_000_000_000,
    },
    broken: {
      content: "Missing a coordinate",
      color: "blue",
      position_x: 0,
    },
  });

  assert.equal(isReservedNoteId("presence"), true);
  assert.deepEqual(
    notes.map((note) => note.id),
    ["realNote"],
  );
});

test("normalization removes invalid stars and converts timestamps", () => {
  const [note] = normalizeNotesCollection({
    note1: {
      content: "Hello",
      color: "blue",
      position_x: 0,
      position_y: 0,
      created_at: 1_700_000_000_000,
      stars: { alice: true, bob: false, corrupt: "yes" },
    },
  });

  assert.equal(note.created_at, "2023-11-14T22:13:20.000Z");
  assert.deepEqual(note.stars, { alice: true });
});

test("profile photos accept secure URLs only", () => {
  assert.equal(
    normalizeUserPhotoUrl("https://lh3.googleusercontent.com/a/avatar"),
    "https://lh3.googleusercontent.com/a/avatar",
  );
  assert.equal(
    normalizeUserPhotoUrl("http://example.com/avatar.png"),
    undefined,
  );
  assert.equal(normalizeUserPhotoUrl("not a url"), undefined);
});
