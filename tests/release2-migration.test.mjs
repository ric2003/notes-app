import test from "node:test";
import assert from "node:assert/strict";
import { prepareRelease2Data } from "../scripts/prepare-release2-data.mjs";
const note = {
  content: "preserve me",
  color: "blue",
  position_x: 0,
  position_y: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  edited_at: "2026-01-01T00:00:00.000Z",
};
test("migration preserves text and attribution, moves stars and drops stale presence", () => {
  const source = {
    notes: {
      n1: { ...note, user_name: "legacy", stars: { alice: true, bob: false } },
      presence: {},
    },
    profiles: { alice: { username: "alice" } },
    presence: { old: true },
  };
  const result = prepareRelease2Data(source);
  assert.equal(result.notes.n1.content, note.content);
  assert.equal(result.notes.n1.user_name, "legacy");
  assert.equal(result.notes.n1.created_at, Date.parse(note.created_at));
  assert.deepEqual(result.noteStars, { n1: { alice: true } });
  assert.equal(result.notes.n1.stars, undefined);
  assert.equal(result.presence, undefined);
  assert.deepEqual(result.profiles, source.profiles);
  assert.equal(source.notes.n1.stars.alice, true);
});
test("migration refuses invalid content instead of truncating it", () => {
  assert.throws(
    () =>
      prepareRelease2Data({
        notes: { n1: { ...note, content: "x".repeat(10001) } },
      }),
    /n1: content/,
  );
});
