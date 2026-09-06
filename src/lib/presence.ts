import type { PublicProfile } from "./profiles";

export type PresenceEntry = {
  id: string;
  username: string;
  isAnonymous: boolean;
  photoURL?: string;
  online: true;
};

// Names and photos come from public profiles, never visitor-supplied presence data.
export function readPresenceEntries(
  value: unknown,
  profiles: Record<string, PublicProfile>,
  now = Date.now(),
): PresenceEntry[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([id, connections]) => {
    if (!connections || typeof connections !== "object") return [];
    const active = Object.values(connections).filter(
      (entry): entry is { since: number; last_seen: number; guest: boolean } =>
        Boolean(
          entry &&
          typeof entry === "object" &&
          "since" in entry &&
          typeof entry.since === "number" &&
          "last_seen" in entry &&
          typeof entry.last_seen === "number" &&
          entry.last_seen >= now - 90000 &&
          entry.last_seen <= now + 5000 &&
          "guest" in entry &&
          typeof entry.guest === "boolean",
        ),
    );
    if (!active.length) return [];
    const guest = active.every((entry) => entry.guest);
    const profile = profiles[id];
    if (!guest && !profile) return [];
    return [
      {
        id,
        username: guest ? "Anonymous" : profile.username,
        isAnonymous: guest,
        photoURL: guest ? undefined : profile.photo_url,
        online: true as const,
      },
    ];
  });
}
