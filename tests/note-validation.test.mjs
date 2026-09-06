import test from "node:test";
import assert from "node:assert/strict";
import {
  readNoteInput,
  validateNoteInput,
  isDatabaseKey,
} from "../src/lib/note-validation.ts";
import { POST } from "../src/app/api/notes/route.ts";
test("route validation rejects unknown fields, oversized text and invalid values", () => {
  for (const body of [
    { content: 1 },
    { content: "x".repeat(10001) },
    { color: "red" },
    { position_x: Infinity },
    { position_y: 1000001 },
    { width: 100 },
    { height: null },
    { stars: { alice: true } },
    { author_id: "../elsewhere" },
  ]) {
    assert.throws(() => validateNoteInput(body, true));
  }
  validateNoteInput({ content: "ok", color: "blue", width: 320 }, true);
});
test("JSON input is an object and is bounded before parsing", async () => {
  for (const text of ["null", "[]", "{broken", '"text"', "x".repeat(65537)]) {
    await assert.rejects(
      readNoteInput(
        new Request("http://localhost", { method: "POST", body: text }),
      ),
    );
  }
});
test("malformed create requests fail without contacting Firebase", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error("must not fetch");
  };
  try {
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "null" }),
    );
    assert.equal(res.status, 400);
  } finally {
    globalThis.fetch = old;
  }
});
test("database identifiers reject path traversal and Firebase path separators", () => {
  for (const id of ["../profiles", "a/b", "a.json?x=1", "presence", ""])
    assert.equal(isDatabaseKey(id), false);
  assert.equal(isDatabaseKey("-Abc_123"), true);
});

test("an author ID without a token cannot silently become an anonymous note", async () => {
  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ author_id: "alice" }),
    }),
  );
  assert.equal(res.status, 401);
});
