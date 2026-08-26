import type { NoteData } from "@/lib/notes";
import { normalizeUserPhotoUrl } from "@/lib/notes";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "anonymous",
  "live_notes",
  "notes",
  "presence",
  "system",
]);

export type PublicProfile = {
  id: string;
  username: string;
  photo_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type ResolvedNoteAuthor = {
  username: string;
  photoUrl?: string;
  isAnonymous: boolean;
};

export type IdentityState =
  | "loading"
  | "signed_out"
  | "needs_username"
  | "ready";

type ProfileStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PROFILE_CACHE_PREFIX = "notesAppPublicProfile:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function normalizeUsername(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

export function getUsernameError(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use lowercase letters, numbers, and underscores only.";
  }
  if (RESERVED_USERNAMES.has(username)) {
    return "That username is reserved. Try another one.";
  }
  return null;
}

export function suggestUsername(
  accountName?: string | null,
  email?: string | null,
): string {
  const emailName = email?.split("@", 1)[0];
  let suggestion = normalizeUsername(accountName || emailName || "user");
  if (suggestion.length < USERNAME_MIN_LENGTH) {
    suggestion = normalizeUsername(`${suggestion || "user"}_notes`);
  }
  if (RESERVED_USERNAMES.has(suggestion)) {
    suggestion = normalizeUsername(`${suggestion}_notes`);
  }
  return suggestion;
}

export function normalizePublicProfile(
  id: string,
  value: unknown,
): PublicProfile | null {
  if (!isRecord(value) || typeof value.username !== "string") return null;
  const username = normalizeUsername(value.username);
  if (username !== value.username || getUsernameError(username)) return null;

  return {
    id,
    username,
    photo_url: normalizeUserPhotoUrl(value.photo_url),
    created_at: normalizeDate(value.created_at),
    updated_at: normalizeDate(value.updated_at),
  };
}

export function normalizePublicProfiles(
  value: unknown,
): Record<string, PublicProfile> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, profile]) => normalizePublicProfile(id, profile))
      .filter((profile): profile is PublicProfile => profile !== null)
      .map((profile) => [profile.id, profile]),
  );
}

function profileCacheKey(userId: string): string {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

export function readCachedProfile(
  storage: ProfileStorage,
  userId: string,
): PublicProfile | null {
  try {
    const value = storage.getItem(profileCacheKey(userId));
    return value ? normalizePublicProfile(userId, JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function writeCachedProfile(
  storage: ProfileStorage,
  profile: PublicProfile,
): void {
  try {
    storage.setItem(
      profileCacheKey(profile.id),
      JSON.stringify({
        username: profile.username,
        photo_url: profile.photo_url,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      }),
    );
  } catch {
    // The live profile remains authoritative when storage is unavailable.
  }
}

export function clearCachedProfile(
  storage: ProfileStorage,
  userId: string,
): void {
  try {
    storage.removeItem(profileCacheKey(userId));
  } catch {
    // Nothing else needs to happen when storage is unavailable.
  }
}

export function selectCurrentProfile({
  userId,
  profiles,
  isProfilesReady,
  cachedProfile,
}: {
  userId: string | null;
  profiles: Record<string, PublicProfile>;
  isProfilesReady: boolean;
  cachedProfile: PublicProfile | null;
}): PublicProfile | null {
  if (!userId) return null;
  const liveProfile = profiles[userId];
  if (liveProfile) return liveProfile;
  if (!isProfilesReady && cachedProfile?.id === userId) return cachedProfile;
  return null;
}

export function getIdentityState({
  isAuthReady,
  isProfilesReady,
  userId,
  profile,
}: {
  isAuthReady: boolean;
  isProfilesReady: boolean;
  userId: string | null;
  profile: PublicProfile | null;
}): IdentityState {
  if (!isAuthReady) return "loading";
  if (!userId) return "signed_out";
  if (profile) return "ready";
  return isProfilesReady ? "needs_username" : "loading";
}

function safeLegacyUsername(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("@")) return undefined;
  return trimmed;
}

export function resolveNoteAuthor(
  note: NoteData,
  profiles: Record<string, PublicProfile>,
): ResolvedNoteAuthor {
  const authorId = note.author_id || note.user_id;
  const snapshotUsername = safeLegacyUsername(
    note.author_username_snapshot || note.user_name,
  );
  const snapshotPhoto = note.author_photo_snapshot || note.user_photo_url;

  if (!authorId) {
    if (snapshotUsername || snapshotPhoto) {
      return {
        username: snapshotUsername || "User",
        photoUrl: snapshotPhoto,
        isAnonymous: false,
      };
    }
    return { username: "Anonymous", isAnonymous: true };
  }

  const profile = profiles[authorId];

  return {
    username: profile?.username || snapshotUsername || "User",
    photoUrl: profile?.photo_url || snapshotPhoto,
    isAnonymous: false,
  };
}
