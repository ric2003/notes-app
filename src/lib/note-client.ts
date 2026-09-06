import { NoteSaveError, type NoteUpdate } from "./note-sync";

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
