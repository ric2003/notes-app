import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function buildDbUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(path, normalized).toString();
}

export async function GET() {
  try {
    const res = await fetch(buildDbUrl("notes.json"), {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`RTDB GET failed with status ${res.status}`);
    }
    const val = ((await res.json()) || {}) as Record<string, unknown>;
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

    // Prepare payload with server-resolved timestamps
    const payload: Omit<NoteRecord, "created_at" | "edited_at"> & {
      created_at: { ".sv": "timestamp" };
      edited_at: { ".sv": "timestamp" };
    } = {
      content: body.content ?? "",
      color: body.color ?? "blue",
      position_x: typeof body.position_x === "number" ? body.position_x : 0,
      position_y: typeof body.position_y === "number" ? body.position_y : 0,
      user_id: body.user_id ?? null,
      created_at: { ".sv": "timestamp" },
      edited_at: { ".sv": "timestamp" },
    };

    // Create new note to get a generated key
    const createRes = await fetch(buildDbUrl("notes.json"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) {
      throw new Error(`RTDB POST failed with status ${createRes.status}`);
    }
    const createData = (await createRes.json()) as { name?: string };
    const newId = createData.name;
    if (!newId) {
      throw new Error("RTDB did not return a generated key");
    }

    // Read back to resolve timestamps
    const readRes = await fetch(buildDbUrl(`notes/${newId}.json`), {
      method: "GET",
      cache: "no-store",
    });
    if (!readRes.ok) {
      throw new Error(`RTDB GET new note failed with status ${readRes.status}`);
    }
    const d = ((await readRes.json()) || {}) as Partial<NoteRecord>;
    const createdIso =
      toIsoStringFromMaybeNumber(d.created_at) ?? new Date().toISOString();
    const editedIso = toIsoStringFromMaybeNumber(d.edited_at) ?? createdIso;

    return NextResponse.json(
      {
        note: {
          id: newId,
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
