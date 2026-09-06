import test from "node:test";
import assert from "node:assert/strict";
import { readPresenceEntries } from "../src/lib/presence.ts";
test("presence combines connections and uses the public profile for identity", () => {
  const profiles = {
    alice: {
      id: "alice",
      username: "alice_name",
      photo_url: "https://example.com/a.png",
    },
  };
  const entries = readPresenceEntries(
    {
      alice: {
        tab1: {
          since: 1,
          last_seen: Date.now(),
          guest: false,
          username: "spoof",
        },
        tab2: { since: 2, last_seen: Date.now(), guest: false },
      },
    },
    profiles,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].username, "alice_name");
  assert.equal(entries[0].photoURL, profiles.alice.photo_url);
});
test("guest presence never inherits a supplied name or photo", () => {
  const entries = readPresenceEntries(
    {
      guest1: {
        tab: {
          since: 1,
          last_seen: Date.now(),
          guest: true,
          username: "admin",
          photoURL: "https://example.com/spoof.png",
        },
      },
    },
    {},
  );
  assert.equal(entries[0].username, "Anonymous");
  assert.equal(entries[0].photoURL, undefined);
});
test("malformed, empty and unprofiled account entries do not count as online", () => {
  assert.deepEqual(
    readPresenceEntries(
      {
        a: {},
        b: { tab: { since: 1, last_seen: Date.now(), guest: false } },
        c: { tab: "invalid" },
      },
      {},
    ),
    [],
  );
});

test("stale connections expire even when disconnect cleanup could not run", () => {
  assert.deepEqual(
    readPresenceEntries(
      { guest: { tab: { since: 1, last_seen: 1000, guest: true } } },
      {},
      92000,
    ),
    [],
  );
  assert.equal(
    readPresenceEntries(
      { guest: { tab: { since: 1, last_seen: 90000, guest: true } } },
      {},
      92000,
    ).length,
    1,
  );
});
