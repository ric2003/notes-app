import type { NoteData } from "@/lib/notes";

export type PendingNoteUpdates = Map<string, Partial<NoteData>>;

export function mergePendingUpdate(
  pending: PendingNoteUpdates,
  noteId: string,
  updates: Partial<NoteData>,
): { next: PendingNoteUpdates; merged: Partial<NoteData> } {
  const merged = { ...pending.get(noteId), ...updates };
  const next = new Map(pending);
  next.set(noteId, merged);
  return { next, merged };
}

export function removePersistedUpdate(
  pending: PendingNoteUpdates,
  noteId: string,
  expected: Partial<NoteData>,
): PendingNoteUpdates {
  if (pending.get(noteId) !== expected) return pending;
  const next = new Map(pending);
  next.delete(noteId);
  return next;
}

export function overlayPendingUpdates(
  notes: NoteData[],
  pending: PendingNoteUpdates,
): NoteData[] {
  return notes.map((note) => ({ ...note, ...pending.get(note.id) }));
}

export function parsePendingUpdates(value: string): PendingNoteUpdates {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return new Map();

  const entries = parsed.filter(
    (entry): entry is [string, Partial<NoteData>] =>
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "object" &&
      entry[1] !== null,
  );
  return new Map(entries);
}
