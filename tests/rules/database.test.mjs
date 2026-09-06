import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  ref,
  set,
  update,
  remove,
  get,
  serverTimestamp,
  onDisconnect,
  goOffline,
} from "firebase/database";
import assert from "node:assert/strict";
let env;
const note = () => ({
  content: "hello",
  color: "blue",
  position_x: 0,
  position_y: 0,
  created_at: serverTimestamp(),
  edited_at: serverTimestamp(),
});
const db = (uid) =>
  uid
    ? env
        .authenticatedContext(uid, {
          firebase: { sign_in_provider: "password" },
        })
        .database()
    : env.unauthenticatedContext().database();
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-notes",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: await readFile("database.rules.json", "utf8"),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearDatabase();
});

test("public visitors can create, edit, move and delete notes", async () => {
  const r = ref(db(), "notes/n1");
  await assertSucceeds(set(r, note()));
  await assertSucceeds(update(r, { content: "edited", position_x: 100 }));
  await assertSucceeds(remove(r));
});
test("content, colors, coordinates, sizes and unknown fields are validated on direct database writes", async () => {
  for (const invalid of [
    { content: 123 },
    { content: "x".repeat(10001) },
    { color: "red" },
    { position_x: 1000001 },
    { width: 100 },
    { unexpected: true },
  ]) {
    await assertFails(set(ref(db(), "notes/n1"), { ...note(), ...invalid }));
  }
});
test("required fields and creation timestamps cannot be removed or rewritten", async () => {
  const r = ref(db(), "notes/n1");
  await set(r, note());
  await assertFails(update(r, { content: null }));
  await assertFails(update(r, { created_at: 1 }));
});
test("a user can star and unstar only as themselves, including ancestor writes and deletion", async () => {
  await set(ref(db(), "notes/n1"), note());
  await assertSucceeds(set(ref(db("alice"), "noteStars/n1/alice"), true));
  await assertFails(set(ref(db("bob"), "noteStars/n1/alice"), true));
  await assertFails(remove(ref(db("bob"), "noteStars/n1/alice")));
  await assertFails(set(ref(db("bob"), "noteStars/n1"), { bob: true }));
  await assertFails(set(ref(db(), "noteStars/n1/guest"), true));
  await assertSucceeds(remove(ref(db("alice"), "noteStars/n1/alice")));
});
test("whole-note updates cannot forge protected stars", async () => {
  await set(ref(db(), "notes/n1"), note());
  await assertFails(update(ref(db(), "notes/n1"), { stars: { alice: true } }));
  await set(ref(db("alice"), "noteStars/n1/alice"), true);
  await update(ref(db(), "notes/n1"), { content: "edited" });
  assert.equal((await get(ref(db(), "noteStars/n1/alice"))).val(), true);
});
test("presence belongs to the authenticated account and rejects supplied usernames", async () => {
  await assertSucceeds(
    set(ref(db("alice"), "presenceV2/alice/tab1"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: false,
    }),
  );
  await assertFails(
    set(ref(db("bob"), "presenceV2/alice/tab2"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: false,
    }),
  );
  await assertFails(remove(ref(db("bob"), "presenceV2/alice/tab1")));
  await assertFails(
    set(ref(db("alice"), "presenceV2/alice/tab2"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: false,
      username: "admin",
    }),
  );
  await assertFails(
    set(ref(db(), "presenceV2/alice/tab2"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: false,
    }),
  );
});
test("guest credentials cannot claim signed-in presence or stars", async () => {
  const guest = env
    .authenticatedContext("guest1", {
      firebase: { sign_in_provider: "anonymous" },
    })
    .database();
  await assertSucceeds(
    set(ref(guest, "presenceV2/guest1/tab1"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: true,
    }),
  );
  await assertFails(
    set(ref(guest, "presenceV2/guest1/tab2"), {
      since: serverTimestamp(),
      last_seen: serverTimestamp(),
      guest: false,
    }),
  );
  await set(ref(db(), "notes/n1"), note());
  await assertFails(set(ref(guest, "noteStars/n1/guest1"), true));
});
test("removing one connection leaves another connection online", async () => {
  const user = db("alice");
  await set(ref(user, "presenceV2/alice/tab1"), {
    since: serverTimestamp(),
    last_seen: serverTimestamp(),
    guest: false,
  });
  await set(ref(user, "presenceV2/alice/tab2"), {
    since: serverTimestamp(),
    last_seen: serverTimestamp(),
    guest: false,
  });
  await remove(ref(user, "presenceV2/alice/tab1"));
  assert.equal((await get(ref(user, "presenceV2/alice/tab2"))).exists(), true);
});

test("public edits cannot change or remove legacy attribution", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), "notes/n1"), {
      ...note(),
      user_id: "alice",
      user_name: "alice_name",
    });
  });
  await assertFails(update(ref(db(), "notes/n1"), { user_name: "spoof" }));
  await assertFails(
    update(ref(db(), "notes/n1"), { user_id: null, user_name: null }),
  );
  await assertSucceeds(
    update(ref(db(), "notes/n1"), { content: "public edit" }),
  );
});

test("signed-in attribution must match the authenticated profile and stays immutable", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), "profiles/alice"), {
      username: "alice_name",
      created_at: 1,
      updated_at: 1,
    });
  });
  await assertFails(
    set(ref(db("bob"), "notes/n1"), {
      ...note(),
      author_id: "alice",
      author_username_snapshot: "alice_name",
    }),
  );
  await assertSucceeds(
    set(ref(db("alice"), "notes/n1"), {
      ...note(),
      author_id: "alice",
      author_username_snapshot: "alice_name",
    }),
  );
  await assertFails(
    update(ref(db(), "notes/n1"), { author_username_snapshot: "spoof" }),
  );
  await assertSucceeds(
    update(ref(db(), "notes/n1"), { content: "public edit" }),
  );
});

test("database note IDs must also be valid API identifiers", async () => {
  await assertFails(set(ref(db(), "notes/space in id"), note()));
  await assertFails(set(ref(db(), "notes/presence"), note()));
});

test("server disconnect cleanup removes only the disconnected client record", async () => {
  const first = db("alice"),
    second = db("alice");
  const firstRef = ref(first, "presenceV2/alice/tab1");
  await onDisconnect(firstRef).remove();
  await set(firstRef, {
    since: serverTimestamp(),
    last_seen: serverTimestamp(),
    guest: false,
  });
  await set(ref(second, "presenceV2/alice/tab2"), {
    since: serverTimestamp(),
    last_seen: serverTimestamp(),
    guest: false,
  });
  goOffline(first);
  const deadline = Date.now() + 5000;
  let remaining;
  do {
    remaining = (await get(ref(second, "presenceV2/alice"))).val();
    if (!remaining?.tab1) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.equal(remaining.tab1, undefined);
  assert.equal(remaining.tab2.guest, false);
});
