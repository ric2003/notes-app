import { NOTE_COLOR_NAMES } from "./noteColors";

export const MAX_NOTE_CONTENT = 10000;
export const MAX_NOTE_POSITION = 1000000;
export const MAX_NOTE_REQUEST_BYTES = 65536;
export const isDatabaseKey = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-zA-Z0-9_-]{1,128}$/.test(value) &&
  value !== "presence";

export class NoteInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function readNoteInput(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new NoteInputError("Expected a JSON object");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_NOTE_REQUEST_BYTES) {
        await reader.cancel();
        throw new NoteInputError("Note request is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new NoteInputError("Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new NoteInputError("Expected a JSON object");
  return body as Record<string, unknown>;
}

export function validateNoteInput(
  body: Record<string, unknown>,
  create: boolean,
) {
  const allowed = new Set([
    "content",
    "color",
    "position_x",
    "position_y",
    "width",
    "height",
    ...(create ? ["author_id"] : ["expected_content", "edited_at"]),
  ]);
  for (const key of Object.keys(body))
    if (!allowed.has(key))
      throw new NoteInputError(`Unexpected note field: ${key}`);
  for (const key of ["content", "expected_content"]) {
    if (
      body[key] !== undefined &&
      (typeof body[key] !== "string" || body[key].length > MAX_NOTE_CONTENT)
    )
      throw new NoteInputError(
        `Note text must be at most ${MAX_NOTE_CONTENT} characters`,
      );
  }
  if (
    body.color !== undefined &&
    !NOTE_COLOR_NAMES.includes(body.color as never)
  )
    throw new NoteInputError("Invalid note color");
  for (const key of ["position_x", "position_y"]) {
    const value = body[key];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > MAX_NOTE_POSITION)
    )
      throw new NoteInputError("Note position is outside the board limits");
  }
  for (const [key, min, max] of [
    ["width", 240, 960],
    ["height", 180, 720],
  ] as const) {
    const value = body[key];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < min ||
        value > max)
    )
      throw new NoteInputError(`Invalid note ${key}`);
  }
  if (body.author_id != null && !isDatabaseKey(body.author_id))
    throw new NoteInputError("Invalid author ID");
}
