import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  ref,
  get,
  update as dbUpdate,
  remove,
  serverTimestamp,
} from "firebase/database";

export const dynamic = "force-dynamic";

type NoteRecord = {
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  user_id?: string | null;
  created_at?: number;
  edited_at?: number;
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

export async function GET(_req: Request, context: unknown) {
  try {
    const { id } = (context as { params?: { id?: string } })?.params || {};
    const noteRef = ref(db, `notes/${id}`);
    const snapshot = await get(noteRef);
    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const d = (snapshot.val() || {}) as Partial<NoteRecord>;
    const createdIso = toIsoStringFromMaybeNumber(d.created_at);
    const editedIso = toIsoStringFromMaybeNumber(d.edited_at);
    return NextResponse.json({
      note: {
        id,
        content: d.content ?? "",
        color: d.color ?? "blue",
        position_x: d.position_x ?? 0,
        position_y: d.position_y ?? 0,
        user_id: d.user_id ?? undefined,
        created_at: createdIso,
        edited_at: editedIso ?? createdIso,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to fetch note",
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

export async function PATCH(req: Request, context: unknown) {
  try {
    const body = (await req.json()) as Partial<{
      content: string;
      color: string;
      position_x: number;
      position_y: number;
      user_id: string | null;
      edited_at: string | boolean; // ignored, server managed
    }>;

    const updates: Record<string, unknown> = {};
    if (typeof body.content === "string") updates.content = body.content;
    if (typeof body.color === "string") updates.color = body.color;
    if (typeof body.position_x === "number")
      updates.position_x = body.position_x;
    if (typeof body.position_y === "number")
      updates.position_y = body.position_y;
    if (typeof body.user_id === "string" || body.user_id === null)
      updates.user_id = body.user_id;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.edited_at = serverTimestamp();

    const { id } = (context as { params?: { id?: string } })?.params || {};
    await dbUpdate(ref(db, `notes/${id}`), updates);

    // Read back to return normalized note
    const snapshot = await get(ref(db, `notes/${id}`));
    const d = (snapshot.val() || {}) as Partial<NoteRecord>;
    const createdIso =
      toIsoStringFromMaybeNumber(d.created_at) ?? new Date().toISOString();
    const editedIso = toIsoStringFromMaybeNumber(d.edited_at) ?? createdIso;

    return NextResponse.json({
      note: {
        id,
        content: d.content ?? "",
        color: d.color ?? "blue",
        position_x: d.position_x ?? 0,
        position_y: d.position_y ?? 0,
        user_id: d.user_id ?? undefined,
        created_at: createdIso,
        edited_at: editedIso,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to update note",
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

export const PUT = PATCH;

export async function DELETE(_req: Request, context: unknown) {
  try {
    const { id } = (context as { params?: { id?: string } })?.params || {};
    await remove(ref(db, `notes/${id}`));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to delete note",
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
