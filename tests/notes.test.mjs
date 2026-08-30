import assert from "node:assert/strict";
import test from "node:test";

import {
  getProfilePhotoBackfills,
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

test("normalization supplies legacy dimensions and clamps stored sizes", () => {
  const [legacy, resized] = normalizeNotesCollection({
    legacy: {
      content: "Old note",
      color: "yellow",
      position_x: 0,
      position_y: 0,
      created_at: 1,
    },
    resized: {
      content: "Large note",
      color: "blue",
      position_x: 0,
      position_y: 0,
      width: 50_000,
      height: 50,
      created_at: 2,
    },
  });

  assert.deepEqual(
    { width: legacy.width, height: legacy.height },
    { width: 320, height: 224 },
  );
  assert.deepEqual(
    { width: resized.width, height: resized.height },
    { width: 960, height: 180 },
  );
});

test("normalization reads the new author schema and legacy fallbacks", () => {
  const [current] = normalizeNotesCollection({
    current: {
      content: "New schema",
      color: "green",
      position_x: 10,
      position_y: 20,
      author_id: "user-1",
      author_username_snapshot: "ric_2003",
      author_photo_snapshot: "https://example.com/current.png",
    },
  });
  const [legacy] = normalizeNotesCollection({
    legacy: {
      content: "Old schema",
      color: "pink",
      position_x: 30,
      position_y: 40,
      user_id: "user-2",
      user_name: "legacy_name",
      user_photo_url: "https://example.com/legacy.png",
    },
  });

  assert.equal(current.author_id, "user-1");
  assert.equal(current.author_username_snapshot, "ric_2003");
  assert.equal(
    current.author_photo_snapshot,
    "https://example.com/current.png",
  );
  assert.equal(legacy.author_id, "user-2");
  assert.equal(legacy.author_username_snapshot, "legacy_name");
  assert.equal(legacy.author_photo_snapshot, "https://example.com/legacy.png");
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

test("signed-in users backfill photos only on their own existing notes", () => {
  const backfills = getProfilePhotoBackfills(
    [
      {
        id: "owned-missing",
        content: "Mine",
        color: "blue",
        position_x: 0,
        position_y: 0,
        user_id: "user-1",
      },
      {
        id: "owned-outdated",
        content: "Mine too",
        color: "pink",
        position_x: 10,
        position_y: 10,
        user_id: "user-1",
        user_photo_url: "https://example.com/old.png",
      },
      {
        id: "someone-else",
        content: "Not mine",
        color: "green",
        position_x: 20,
        position_y: 20,
        user_id: "user-2",
      },
    ],
    "user-1",
    "https://lh3.googleusercontent.com/a/current",
  );

  assert.deepEqual(backfills, [
    {
      noteId: "owned-missing",
      photoUrl: "https://lh3.googleusercontent.com/a/current",
    },
    {
      noteId: "owned-outdated",
      photoUrl: "https://lh3.googleusercontent.com/a/current",
    },
  ]);
  assert.deepEqual(
    getProfilePhotoBackfills([], "user-1", "http://example.com/avatar.png"),
    [],
  );
});
