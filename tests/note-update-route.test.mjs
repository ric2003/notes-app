import assert from "node:assert/strict";
import test from "node:test";
import { PATCH } from "../src/app/api/notes/[id]/route.ts";

const initial = {
  content: "original",
  color: "blue",
  position_x: 10,
  position_y: 20,
  width: 320,
  height: 224,
  created_at: 1700000000000,
  edited_at: 1700000000000,
};
async function withDatabase(action, initialValue = initial, beforeWrite) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
    "https://notes-test.firebaseio.com/";
  let value = structuredClone(initialValue),
    revision = 0,
    writes = 0;
  globalThis.fetch = async (_, init) => {
    if (init.method === "GET") {
      assert.equal(init.headers["X-Firebase-ETag"], "true");
      return Response.json(value, { headers: { etag: String(revision) } });
    }
    assert.equal(init.method, "PUT");
    if (beforeWrite) {
      value = beforeWrite(value, writes);
      if (writes === 0) revision++;
    }
    writes++;
    if (init.headers["if-match"] !== String(revision))
      return Response.json(value, { status: 412 });
    value = JSON.parse(init.body);
    value.edited_at = 1700000001000;
    revision++;
    return Response.json(value);
  };
  const patch = (body) =>
    PATCH(
      new Request("http://localhost/api/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "note-1" }) },
    );
  try {
    await action({ patch, value: () => value, writes: () => writes });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined)
      delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    else process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = originalUrl;
  }
}

test("updates persist bounded dimensions and preserve the rest of the note", async () => {
  await withDatabase(async ({ patch, value }) => {
    const response = await patch({ width: 560, height: 400 });
    assert.equal(response.status, 200);
    assert.equal(value().width, 560);
    assert.equal(value().height, 400);
    assert.equal(value().content, "original");
  });
});
test("updates reject invalid dimensions before writing", async () => {
  await withDatabase(async ({ patch, writes }) => {
    assert.equal((await patch({ width: 120 })).status, 400);
    assert.equal(writes(), 0);
  });
});
test("stale content returns a conflict and leaves the remote text intact", async () => {
  await withDatabase(async ({ patch, value, writes }) => {
    const response = await patch({ content: "mine", expected_content: "old" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).note.content, "original");
    assert.equal(value().content, "original");
    assert.equal(writes(), 0);
  });
});
test("retrying an acknowledged write is idempotent even with an old content baseline", async () => {
  await withDatabase(async ({ patch }) => {
    assert.equal(
      (await patch({ content: "original", expected_content: "old" })).status,
      200,
    );
  });
});
test("concurrent text changes between read and write cannot be overwritten", async () => {
  await withDatabase(
    async ({ patch, value }) => {
      const response = await patch({
        content: "mine",
        expected_content: "original",
      });
      assert.equal(response.status, 409);
      assert.equal(value().content, "theirs");
    },
    initial,
    (value, attempt) =>
      attempt === 0 ? { ...value, content: "theirs" } : value,
  );
});
test("unrelated concurrent stars survive a retried text save", async () => {
  await withDatabase(
    async ({ patch, value }) => {
      assert.equal(
        (await patch({ content: "mine", expected_content: "original" })).status,
        200,
      );
      assert.deepEqual(value().stars, { someone: true });
      assert.equal(value().content, "mine");
    },
    initial,
    (value, attempt) =>
      attempt === 0 ? { ...value, stars: { someone: true } } : value,
  );
});
test("an update cannot recreate a deleted note", async () => {
  await withDatabase(async ({ patch, writes }) => {
    assert.equal((await patch({ content: "mine" })).status, 404);
    assert.equal(writes(), 0);
  }, null);
});
test("deletion between read and write does not resurrect the note", async () => {
  await withDatabase(
    async ({ patch, value }) => {
      assert.equal((await patch({ content: "mine" })).status, 404);
      assert.equal(value(), null);
    },
    initial,
    () => null,
  );
});
