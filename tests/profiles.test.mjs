import assert from "node:assert/strict";
import test from "node:test";

import {
  getUsernameError,
  normalizePublicProfiles,
  normalizeUsername,
  resolveNoteAuthor,
  suggestUsername,
} from "../src/lib/profiles.ts";

test("usernames normalize to one lowercase public name", () => {
  assert.equal(normalizeUsername("  José Silva  "), "jose_silva");
  assert.equal(normalizeUsername("MOBILE--NOTES!!"), "mobile_notes");
  assert.equal(
    getUsernameError("ab"),
    "Username must be at least 3 characters.",
  );
  assert.equal(
    getUsernameError("anonymous"),
    "That username is reserved. Try another one.",
  );
  assert.equal(getUsernameError("ric_2003"), null);
  assert.equal(
    suggestUsername("Ric Silva", "ignored@example.com"),
    "ric_silva",
  );
});

test("public profile normalization excludes malformed and private data", () => {
  const profiles = normalizePublicProfiles({
    user1: {
      username: "ric_2003",
      photo_url: "https://example.com/ric.png",
      email: "must-not-be-copied@example.com",
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_100,
    },
    uppercase: { username: "Not_Normalized" },
    malformed: { photo_url: "https://example.com/no-name.png" },
  });

  assert.deepEqual(Object.keys(profiles), ["user1"]);
  assert.equal(profiles.user1.username, "ric_2003");
  assert.equal(profiles.user1.photo_url, "https://example.com/ric.png");
  assert.equal("email" in profiles.user1, false);
});

test("note authors prefer the live profile and retain snapshot fallbacks", () => {
  const note = {
    id: "note1",
    content: "Hello",
    color: "blue",
    position_x: 0,
    position_y: 0,
    author_id: "user1",
    author_username_snapshot: "old_name",
    author_photo_snapshot: "https://example.com/old.png",
  };

  assert.deepEqual(
    resolveNoteAuthor(note, {
      user1: {
        id: "user1",
        username: "current_name",
        photo_url: "https://example.com/current.png",
      },
    }),
    {
      username: "current_name",
      photoUrl: "https://example.com/current.png",
      isAnonymous: false,
    },
  );

  assert.deepEqual(resolveNoteAuthor(note, {}), {
    username: "old_name",
    photoUrl: "https://example.com/old.png",
    isAnonymous: false,
  });
});

test("legacy notes resolve without exposing stored email addresses", () => {
  const legacyNote = {
    id: "legacy",
    content: "Old note",
    color: "yellow",
    position_x: 0,
    position_y: 0,
    user_id: "old-user",
    user_name: "private@example.com",
  };

  assert.deepEqual(resolveNoteAuthor(legacyNote, {}), {
    username: "User",
    photoUrl: undefined,
    isAnonymous: false,
  });

  assert.deepEqual(
    resolveNoteAuthor(
      {
        id: "anonymous",
        content: "Guest note",
        color: "pink",
        position_x: 0,
        position_y: 0,
      },
      {},
    ),
    { username: "Anonymous", isAnonymous: true },
  );
});

test("legacy author snapshots render when the account ID is missing", () => {
  assert.deepEqual(
    resolveNoteAuthor(
      {
        id: "legacy-snapshot",
        content: "Old attributed note",
        color: "blue",
        position_x: 0,
        position_y: 0,
        user_name: "Test user",
        user_photo_url: "https://example.com/legacy.png",
      },
      {},
    ),
    {
      username: "Test user",
      photoUrl: "https://example.com/legacy.png",
      isAnonymous: false,
    },
  );
});
