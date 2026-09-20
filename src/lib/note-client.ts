import { NoteSaveError, type NoteUpdate } from "./note-sync";
import type { NoteData } from "./notes";

export async function saveNoteUpdate(
  noteId: string,
  updates: NoteUpdate,
): Promise<void> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new NoteSaveError(
      data.error ?? "Couldn't save this note",
      response.status,
      data.note,
    );
  }
}

export async function deleteNote(noteId: string): Promise<void> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 404)
    throw new Error(`Delete failed: ${response.status}`);
}

export async function createNote(
  note: NoteData,
  authToken: string | null,
): Promise<void> {
  const {
    id,
    content,
    color,
    position_x,
    position_y,
    width,
    height,
    author_id,
  } = note;
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      id,
      content,
      color,
      position_x,
      position_y,
      width,
      height,
      author_id,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new NoteSaveError(
      data.error ?? "Couldn't create this note",
      response.status,
    );
  }
}
