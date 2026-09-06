import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Prepare a new export for review. This script never connects to Firebase.
export function prepareRelease2Data(source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw Error("Expected a root database export");
  const output = structuredClone(source);
  const fields = new Set([
    "content",
    "color",
    "position_x",
    "position_y",
    "width",
    "height",
    "created_at",
    "edited_at",
    "author_id",
    "author_username_snapshot",
    "author_photo_snapshot",
    "user_id",
    "user_name",
    "user_photo_url",
  ]);
  const issues = [];
  output.noteStars ??= {};
  for (const [id, raw] of Object.entries(output.notes ?? {})) {
    if (id === "presence") {
      delete output.notes[id];
      continue;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
      issues.push(`${id}: note ID cannot be used by the app`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push(`${id}: invalid note record`);
      continue;
    }
    const note = Object.fromEntries(
      Object.entries(raw).filter(([key]) => fields.has(key)),
    );
    for (const key of ["created_at", "edited_at"]) {
      if (typeof note[key] === "string") note[key] = Date.parse(note[key]);
    }
    if (typeof note.content !== "string" || note.content.length > 10000)
      issues.push(
        `${id}: content must be a string of at most 10000 characters`,
      );
    if (
      !["yellow", "blue", "green", "pink", "purple", "orange"].includes(
        note.color,
      )
    )
      issues.push(`${id}: unsupported color`);
    for (const key of ["position_x", "position_y"])
      if (
        typeof note[key] !== "number" ||
        !Number.isFinite(note[key]) ||
        Math.abs(note[key]) > 1000000
      )
        issues.push(`${id}: invalid ${key}`);
    for (const [key, min, max] of [
      ["width", 240, 960],
      ["height", 180, 720],
    ])
      if (
        note[key] !== undefined &&
        (typeof note[key] !== "number" ||
          !Number.isFinite(note[key]) ||
          note[key] < min ||
          note[key] > max)
      )
        issues.push(`${id}: invalid ${key}`);
    if (
      !Number.isFinite(note.created_at) ||
      !Number.isFinite(note.edited_at) ||
      note.edited_at < note.created_at ||
      note.edited_at > Date.now()
    )
      issues.push(`${id}: invalid timestamps`);
    for (const key of [
      "author_id",
      "author_username_snapshot",
      "author_photo_snapshot",
    ])
      if (
        note[key] !== undefined &&
        (typeof note[key] !== "string" || note[key].length > 2048)
      )
        issues.push(`${id}: invalid ${key}`);
    for (const [uid, starred] of Object.entries(raw.stars ?? {})) {
      if (starred === true && output.noteStars[id]?.[uid] === undefined) {
        output.noteStars[id] ??= {};
        output.noteStars[id][uid] = true;
      }
    }
    output.notes[id] = note;
  }
  if (issues.length)
    throw Error(
      `Resolve these records in a copy of the export before migration:\n${issues.join("\n")}`,
    );
  delete output.presence;
  delete output.presenceV2;
  return output;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || resolve(input) === resolve(output))
    throw Error(
      "Usage: node scripts/prepare-release2-data.mjs input.json new-output.json",
    );
  const transformed = prepareRelease2Data(
    JSON.parse(await readFile(input, "utf8")),
  );
  await writeFile(output, JSON.stringify(transformed, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    `Prepared ${Object.keys(transformed.notes ?? {}).length} notes. Review ${output} before importing it during a write freeze.`,
  );
}
