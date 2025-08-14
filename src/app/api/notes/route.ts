import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, push, set, serverTimestamp } from "firebase/database";

export const dynamic = "force-dynamic";

type CreateNotePayload = {
  content?: string;
  color?: string;
  position_x?: number;
  position_y?: number;
  user_id?: string | null;
};

type NoteRecord = {
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  user_id?: string | null;
  created_at?: number;
  edited_at?: number;
};

type ApiNote = {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  user_id?: string;
  created_at?: string;
  edited_at?: string;
};

function toIsoStringFromMaybeNumber(value: unknown): string | undefined {
  if (typeof value === "number") {
    try {
      return new Date(value).toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function GET() {
  try {
    const snapshot = await get(ref(db, "notes"));
    const val = (snapshot.val() || {}) as Record<string, unknown>;
    const notes: ApiNote[] = Object.entries(val).map(([id, data]) => {
      const d = (data ?? {}) as Partial<NoteRecord>;
      const createdIso = toIsoStringFromMaybeNumber(d.created_at);
      const editedIso = toIsoStringFromMaybeNumber(d.edited_at);
      return {
        id,
        content: d.content ?? "",
        color: d.color ?? "blue",
        position_x: d.position_x ?? 0,
        position_y: d.position_y ?? 0,
        user_id: d.user_id ?? undefined,
        created_at: createdIso,
        edited_at: editedIso ?? createdIso,
      };
    });
    notes.sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return aTime - bTime;
    });
    return NextResponse.json({ notes });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to load notes",
        details:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateNotePayload;

    type ServerTimestampValue = ReturnType<typeof serverTimestamp>;
    const newNote: Omit<NoteRecord, "created_at" | "edited_at"> & {
      created_at: ServerTimestampValue;
      edited_at: ServerTimestampValue;
    } = {
      content: body.content ?? "",
      color: body.color ?? "blue",
      position_x: typeof body.position_x === "number" ? body.position_x : 0,
      position_y: typeof body.position_y === "number" ? body.position_y : 0,
      user_id: body.user_id ?? null,
      created_at: serverTimestamp(),
      edited_at: serverTimestamp(),
    };

    const notesRef = ref(db, "notes");
    const newRef = push(notesRef);
    await set(newRef, newNote);

    // Read back the saved note so we can return resolved timestamps
    const saved = await get(newRef);
    const d = (saved.val() || {}) as Partial<NoteRecord>;
    const createdIso =
      toIsoStringFromMaybeNumber(d.created_at) ?? new Date().toISOString();
    const editedIso = toIsoStringFromMaybeNumber(d.edited_at) ?? createdIso;

    return NextResponse.json(
      {
        note: {
          id: newRef.key,
          content: d.content ?? "",
          color: d.color ?? "blue",
          position_x: d.position_x ?? 0,
          position_y: d.position_y ?? 0,
          user_id: d.user_id ?? undefined,
          created_at: createdIso,
          edited_at: editedIso,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to create note",
        details:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unknown error",
      },
      { status: 500 }
    );
  }
}
