export interface NoteData {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  created_at?: string;
  user_id?: string;
  user_name?: string;
  user_photo_url?: string;
  edited_at?: string;
  stars?: Record<string, boolean>;
}

const RESERVED_NOTE_IDS = new Set(["presence"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeStars(value: unknown): Record<string, boolean> | undefined {
  if (!isRecord(value)) return undefined;
  const stars = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => {
      return entry[1] === true;
    }),
  );
  return Object.keys(stars).length > 0 ? stars : undefined;
}

export function normalizeUserPhotoUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function isReservedNoteId(id: string) {
  return RESERVED_NOTE_IDS.has(id);
}

export function normalizeNoteRecord(
  id: string,
  value: unknown,
): NoteData | null {
  if (isReservedNoteId(id) || !isRecord(value)) return null;

  const {
    content,
    color,
    position_x: positionX,
    position_y: positionY,
  } = value;
  if (
    typeof content !== "string" ||
    typeof color !== "string" ||
    typeof positionX !== "number" ||
    typeof positionY !== "number" ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY)
  ) {
    return null;
  }

  const createdAt = normalizeDate(value.created_at);
  const editedAt = normalizeDate(value.edited_at) ?? createdAt;

  return {
    id,
    content,
    color,
    position_x: positionX,
    position_y: positionY,
    created_at: createdAt,
    edited_at: editedAt,
    user_id: typeof value.user_id === "string" ? value.user_id : undefined,
    user_name:
      typeof value.user_name === "string" ? value.user_name : undefined,
    user_photo_url: normalizeUserPhotoUrl(value.user_photo_url),
    stars: normalizeStars(value.stars),
  };
}

export function normalizeNotesCollection(value: unknown): NoteData[] {
  if (!isRecord(value)) return [];

  return Object.entries(value)
    .map(([id, record]) => normalizeNoteRecord(id, record))
    .filter((note): note is NoteData => note !== null)
    .sort((first, second) => {
      const firstTime = first.created_at ? Date.parse(first.created_at) : 0;
      const secondTime = second.created_at ? Date.parse(second.created_at) : 0;
      return firstTime - secondTime;
    });
}
