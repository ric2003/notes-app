import { NextResponse } from "next/server";
import {
  isReservedNoteId,
  normalizeNoteRecord,
  normalizeUserPhotoUrl,
} from "@/lib/notes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildDbUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(path, normalized).toString();
}

export async function GET(_req: Request, context: unknown) {
  try {
    const params = await (context as { params: Promise<{ id: string }> })
      .params;
    const { id } = params;
    if (isReservedNoteId(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const res = await fetch(buildDbUrl(`notes/${id}.json`), {
      method: "GET",
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!res.ok) {
      throw new Error(`RTDB GET failed with status ${res.status}`);
    }
    const note = normalizeNoteRecord(id, await res.json());
    if (!note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note });
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
      { status: 500 },
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
      user_name: string | null;
      user_photo_url: string | null;
      edited_at: string | boolean; // ignored, server managed
    }>;

    const updates: Record<string, unknown> = {};
    if (typeof body.content === "string") updates.content = body.content;
    if (typeof body.color === "string") updates.color = body.color;
    if (typeof body.position_x === "number")
      updates.position_x = body.position_x;
    if (typeof body.position_y === "number")
      updates.position_y = body.position_y;
    // Legacy fields remain writable for pending updates from older clients.
    if (typeof body.user_id === "string" || body.user_id === null)
      updates.user_id = body.user_id;
    if (typeof body.user_name === "string" || body.user_name === null)
      updates.user_name = body.user_name;
    if (
      typeof body.user_photo_url === "string" ||
      body.user_photo_url === null
    ) {
      updates.user_photo_url =
        normalizeUserPhotoUrl(body.user_photo_url) ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    updates.edited_at = { ".sv": "timestamp" };

    const params = await (context as { params: Promise<{ id: string }> })
      .params;
    const { id } = params;
    if (isReservedNoteId(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const patchRes = await fetch(buildDbUrl(`notes/${id}.json`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!patchRes.ok) {
      throw new Error(`RTDB PATCH failed with status ${patchRes.status}`);
    }

    // Read back to return normalized note
    const readRes = await fetch(buildDbUrl(`notes/${id}.json`), {
      method: "GET",
      cache: "no-store",
    });
    if (!readRes.ok) {
      throw new Error(
        `RTDB GET after PATCH failed with status ${readRes.status}`,
      );
    }
    const note = normalizeNoteRecord(id, await readRes.json());
    if (!note) throw new Error("RTDB returned an invalid note");

    return NextResponse.json({ note });
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
      { status: 500 },
    );
  }
}

export const PUT = PATCH;

export async function DELETE(_req: Request, context: unknown) {
  try {
    const params = await (context as { params: Promise<{ id: string }> })
      .params;
    const { id } = params;
    if (isReservedNoteId(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const res = await fetch(buildDbUrl(`notes/${id}.json`), {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(`RTDB DELETE failed with status ${res.status}`);
    }
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
      { status: 500 },
    );
  }
}
