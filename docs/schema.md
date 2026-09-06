# Data schema

Live Notes stores public board data in Firebase Realtime Database. Firebase Auth remains the source of account IDs and email addresses. Email addresses are not copied into public database paths.

## Public profiles

```text
profiles/{uid}
  username: string
  photo_url?: HTTPS URL
  created_at: server timestamp
  updated_at: server timestamp
```

Profiles are publicly readable because every viewer needs to render note authors. Only the authenticated account with the matching UID can create, update, or delete its profile. A profile username cannot change after creation.

## Username reservations

```text
usernames/{username}: uid
```

The client claims this record with a Firebase transaction before creating the profile. Usernames contain 3 to 24 lowercase letters, numbers, or underscores. Reserved application names cannot be claimed.

## Notes

```text
notes/{noteId}
  content: string
  color: string
  position_x: number
  position_y: number
  width?: number
  height?: number
  author_id?: uid
  author_username_snapshot?: string
  author_photo_snapshot?: HTTPS URL
  created_at: server timestamp
  edited_at: server timestamp
```

Anonymous notes omit all author fields. Authenticated note creation sends a Firebase ID token, and database rules require `author_id` to match that account. Rules also require the snapshots to match the reserved public profile and prevent later attribution changes.

New notes store their width and height in canvas pixels. The client treats missing dimensions on older notes as `320 × 224`. Resizing is limited to widths from 240 through 960 and heights from 180 through 720.

Readers prefer the current profile username and photo. Snapshots are the fallback if the profile is missing. The legacy `user_id`, `user_name`, and `user_photo_url` fields remain readable so existing notes do not need an immediate destructive migration.

## Stars

```text
noteStars/{noteId}/{uid}: true
```

Only the matching non-anonymous Firebase account can add or remove its vote.
Whole-note updates cannot modify votes. Inline `notes/{id}/stars` is no longer
accepted; see [the release 2 rollout](release-2-rollout.md) for migration.

## Presence

```text
presenceV2/{uid}/{connectionId}
  since: server timestamp
  last_seen: server timestamp
  guest: boolean
```

Each connection owns a separate record beneath its authenticated UID. Guest
presence uses tab-local Firebase Anonymous Auth. Names and photos are resolved
from public profiles, never accepted from presence records. A person is online
while any connection has refreshed within 90 seconds. Clients refresh every 30 seconds. Disconnect cleanup is registered before publishing
presence. The legacy `presence` path is closed.

## Validation

Note text is limited to 10,000 UTF-16 code units, colors to the supported palette,
positions to ±1,000,000 canvas pixels, and dimensions to the bounds above.
Creation timestamps are immutable. Author snapshots and legacy attribution are
immutable on existing notes. Unknown fields are rejected. API request bodies
are limited to 64 KiB; database rules enforce field validation on direct writes.
