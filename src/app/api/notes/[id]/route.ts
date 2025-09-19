import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NoteRecord = {
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  user_id?: string | null;
  user_name?: string | null;
  created_at?: number;
  edited_at?: number;
  stars?: Record<string, boolean>;
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

function buildDbUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(path, normalized).toString();
}

export async function GET(_req: Request, context: unknown) {
  try {
    const { id } = (context as { params?: { id?: string } })?.params || {};
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
    const d = ((await res.json()) || {}) as Partial<NoteRecord>;
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
        user_name: d.user_name ?? undefined,
        created_at: createdIso,
        edited_at: editedIso ?? createdIso,
        stars: d.stars ?? undefined,
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
      user_name: string | null;
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
    if (typeof body.user_name === "string" || body.user_name === null)
      updates.user_name = body.user_name;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.edited_at = { ".sv": "timestamp" };

    const { id } = (context as { params?: { id?: string } })?.params || {};
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
        `RTDB GET after PATCH failed with status ${readRes.status}`
      );
    }
    const d = ((await readRes.json()) || {}) as Partial<NoteRecord>;
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
        user_name: d.user_name ?? undefined,
        created_at: createdIso,
        edited_at: editedIso,
        stars: d.stars ?? undefined,
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
      { status: 500 }
    );
  }
}
