import type { NoteData } from "@/lib/notes";

export async function saveNoteUpdate(
  noteId: string,
  updates: Partial<NoteData>,
): Promise<void> {
  const response = await fetch(`/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Status ${response.status}`);
  }
}
