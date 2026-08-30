import assert from "node:assert/strict";
import test from "node:test";

import { PATCH } from "../src/app/api/notes/[id]/route.ts";

test("note updates persist bounded dimensions", async () => {
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
    "https://notes-test.firebaseio.com/";

  let patchBody;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/notes/note-1.json") && init?.method === "PATCH") {
      patchBody = JSON.parse(String(init.body));
      return Response.json({});
    }
    if (url.endsWith("/notes/note-1.json") && init?.method === "GET") {
      return Response.json({
        content: "Resize me",
        color: "blue",
        position_x: 10,
        position_y: 20,
        width: patchBody.width,
        height: patchBody.height,
        created_at: 1_700_000_000_000,
        edited_at: 1_700_000_001_000,
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await PATCH(
      new Request("http://localhost/api/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: 560, height: 400 }),
      }),
      { params: Promise.resolve({ id: "note-1" }) },
    );

    assert.equal(response.status, 200);
    assert.equal(patchBody.width, 560);
    assert.equal(patchBody.height, 400);
    assert.deepEqual(patchBody.edited_at, { ".sv": "timestamp" });
    const { note } = await response.json();
    assert.equal(note.width, 560);
    assert.equal(note.height, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("note updates reject dimensions outside the supported range", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Invalid dimensions should not reach Firebase");
  };

  try {
    const response = await PATCH(
      new Request("http://localhost/api/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: 120, height: 400 }),
      }),
      { params: Promise.resolve({ id: "note-1" }) },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid note width" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
