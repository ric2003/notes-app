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
  stars?: {uid: true}
```

Anonymous notes omit all author fields. Authenticated note creation sends a Firebase ID token, and database rules require `author_id` to match that account. Rules also require the snapshots to match the reserved public profile and prevent later attribution changes.

New notes store their width and height in canvas pixels. The client treats missing dimensions on older notes as `320 × 224`. Resizing is limited to widths from 240 through 960 and heights from 180 through 720.

Readers prefer the current profile username and photo. Snapshots are the fallback if the profile is missing. The legacy `user_id`, `user_name`, and `user_photo_url` fields remain readable so existing notes do not need an immediate destructive migration.

## Presence

```text
presence/{sessionOrAccountId}
  id: string
  username: string
  isAnonymous: boolean
  photoURL?: HTTPS URL
  online: boolean
  last_changed: server timestamp
```

Presence is public and temporary. It never contains an email address. New clients no longer read or write the old `notes/presence` path.

During the rules rollout, clients also write `name` with the same value as `username` so sessions using the previous presence validator can reconnect. The rules reject a different value, and the compatibility field can be removed after every deployed client uses the new rules.
