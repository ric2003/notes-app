import { NextResponse } from "next/server";
import { normalizeNoteRecord, normalizeNotesCollection } from "@/lib/notes";
import { normalizePublicProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateNotePayload = {
  content?: string;
  color?: string;
  position_x?: number;
  position_y?: number;
  author_id?: string | null;
};

type NoteRecord = {
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  author_id?: string | null;
  author_username_snapshot?: string | null;
  author_photo_snapshot?: string | null;
  created_at?: number;
  edited_at?: number;
  stars?: Record<string, boolean>;
};

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function buildDbUrl(path: string, authToken?: string | null): string {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  const url = new URL(path, normalized);
  if (authToken) url.searchParams.set("auth", authToken);
  return url.toString();
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
    const notes = normalizeNotesCollection(await res.json());
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
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateNotePayload;
    const authToken = getBearerToken(req);
    const requestedAuthorId =
      authToken && typeof body.author_id === "string" ? body.author_id : null;
    let authorProfile = null;

    if (requestedAuthorId) {
      const profileRes = await fetch(
        buildDbUrl(`profiles/${requestedAuthorId}.json`),
        { method: "GET", cache: "no-store" },
      );
      if (!profileRes.ok) {
        throw new Error(
          `Profile lookup failed with status ${profileRes.status}`,
        );
      }
      authorProfile = normalizePublicProfile(
        requestedAuthorId,
        await profileRes.json(),
      );
      if (!authorProfile) {
        return NextResponse.json(
          { error: "Choose a username before creating a note" },
          { status: 400 },
        );
      }
    }

    // Prepare payload with server-resolved timestamps
    const payload: Omit<NoteRecord, "created_at" | "edited_at"> & {
      created_at: { ".sv": "timestamp" };
      edited_at: { ".sv": "timestamp" };
    } = {
      content: body.content ?? "",
      color: body.color ?? "blue",
      position_x: typeof body.position_x === "number" ? body.position_x : 0,
      position_y: typeof body.position_y === "number" ? body.position_y : 0,
      author_id: authorProfile?.id ?? null,
      author_username_snapshot: authorProfile?.username ?? null,
      author_photo_snapshot: authorProfile?.photo_url ?? null,
      created_at: { ".sv": "timestamp" },
      edited_at: { ".sv": "timestamp" },
    };

    // Create new note to get a generated key
    const createRes = await fetch(buildDbUrl("notes.json", authToken), {
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
    const note = normalizeNoteRecord(newId, await readRes.json());
    if (!note) throw new Error("RTDB returned an invalid note");

    return NextResponse.json({ note }, { status: 201 });
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
      { status: 500 },
    );
  }
}
