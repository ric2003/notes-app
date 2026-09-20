import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../src/app/api/notes/route.ts";

test("authenticated note creation derives snapshots from the public profile", async () => {
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
    "https://notes-test.firebaseio.com/";

  let createUrl;
  let createBody;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/profiles/user-1.json")) {
      return Response.json({
        username: "current_name",
        photo_url: "https://example.com/current.png",
        created_at: 1_700_000_000_000,
        updated_at: 1_700_000_000_000,
      });
    }
    if (url.includes("/notes.json")) {
      createUrl = url;
      createBody = JSON.parse(String(init?.body));
      return Response.json({ name: "created-note" });
    }
    if (url.endsWith("/notes/created-note.json")) {
      return Response.json({
        ...createBody,
        created_at: 1_700_000_000_000,
        edited_at: 1_700_000_000_000,
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await POST(
      new Request("http://localhost/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer id-token",
        },
        body: JSON.stringify({
          content: "Hello",
          color: "blue",
          position_x: 10,
          position_y: 20,
          width: 480,
          height: 320,
          author_id: "user-1",
        }),
      }),
    );

    assert.equal(response.status, 201);
    assert.equal(
      createUrl,
      "https://notes-test.firebaseio.com/notes.json?auth=id-token",
    );
    assert.equal(createBody.author_id, "user-1");
    assert.equal(createBody.width, 480);
    assert.equal(createBody.height, 320);
    assert.equal(createBody.author_username_snapshot, "current_name");
    assert.equal(
      createBody.author_photo_snapshot,
      "https://example.com/current.png",
    );
    const { note } = await response.json();
    assert.equal(note.author_username_snapshot, "current_name");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("anonymous note creation omits public identity fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
    "https://notes-test.firebaseio.com/";

  let createBody;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/notes.json")) {
      createBody = JSON.parse(String(init?.body));
      return Response.json({ name: "anonymous-note" });
    }
    if (url.endsWith("/notes/anonymous-note.json")) {
      return Response.json({
        ...createBody,
        created_at: 1_700_000_000_000,
        edited_at: 1_700_000_000_000,
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await POST(
      new Request("http://localhost/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Guest note",
          color: "yellow",
          author_id: null,
        }),
      }),
    );

    assert.equal(response.status, 201);
    assert.equal(createBody.author_id, null);
    assert.equal(createBody.author_username_snapshot, null);
    assert.equal(createBody.author_photo_snapshot, null);
    assert.equal(createBody.width, 320);
    assert.equal(createBody.height, 224);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("client IDs use conditional creation and retries never overwrite existing text", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL =
    "https://notes-test.firebaseio.com/";
  let stored;
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://notes-test.firebaseio.com/notes/client-note.json",
    );
    if (init.method === "PUT") {
      assert.equal(init.headers["if-match"], "null_etag");
      if (stored) return Response.json(stored, { status: 412 });
      writes++;
      stored = {
        ...JSON.parse(init.body),
        created_at: 1700000000000,
        edited_at: 1700000000000,
      };
      return Response.json(stored);
    }
    return Response.json(stored);
  };
  const request = () =>
    new Request("http://localhost/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "client-note", content: "", color: "blue" }),
    });
  try {
    assert.equal((await POST(request())).status, 201);
    stored.content = "already edited";
    const retry = await POST(request());
    assert.equal(retry.status, 201);
    assert.equal((await retry.json()).note.content, "already edited");
    assert.equal(writes, 1);
    const invalid = await POST(
      new Request("http://localhost/api/notes", {
        method: "POST",
        body: JSON.stringify({ id: "../other" }),
      }),
    );
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined)
      delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    else process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = originalUrl;
  }
});
