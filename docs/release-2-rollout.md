# Release 2 rollout

This branch builds on release 1. No live configuration or data is changed by the
implementation or tests.

## Before deployment

1. Enable Anonymous sign-in in Firebase Authentication. Guest presence uses a
   separate Firebase app with credentials held in memory for that tab. It does
   not sign the visitor into the account UI. Without this provider, guests can
   still use notes, but cannot publish presence.
2. Take a root Realtime Database export and retain it as a backup.
3. Prepare and review a new export with
   `node scripts/prepare-release2-data.mjs backup.json release2.json`.
   The script works on files only and refuses to overwrite either file. It moves
   inline stars to `noteStars`, converts ISO timestamps to numbers, removes stale
   presence and unknown note fields, and refuses oversized or invalid notes.
   Repair invalid records in a copy; it never silently truncates note text.
4. Schedule a write freeze for the final export, import, rules deployment and app
   rollout. A preparation export taken earlier must not replace newer live data.
   Existing clients write the old star and presence paths and must reload after
   deployment. Deploy the reviewed `database.rules.json` with the new app.
5. Verify guest and account presence, two tabs under one account, note creation,
   editing, stars, and reconnects. Keep the original export until verification is
   complete. Roll back the app, rules and data together during a write freeze if
   required; restoring a backup can discard newer changes.

## Behavior and limits

- Notes remain public and editable by anyone, including deletion. This release
  prevents identity spoofing and bounds payloads; it does not prevent all spam or
  replace server-side traffic controls. API-only throttling would not protect
  direct database writes.
- `noteStars/{noteId}/{uid}` is writable only by that signed-in account. Imported
  legacy votes preserve historical counts, but their original authorship cannot
  be verified because the old rules allowed public writes. New votes require an
  existing note. Orphan votes after deletion are not displayed.
- `presenceV2/{uid}/{connectionId}` contains only `since`, `last_seen`, and `guest`. Clients
  resolve signed-in usernames and photos from public profiles. Disconnect cleanup
  removes only the affected connection. Heartbeats refresh every 30 seconds;
  clients ignore records older than 90 seconds using Firebase server clock offset. Old `presence` reads and writes are denied.
- Each browser tab holds a Web Lock on its own persisted queue. A closed tab's
  work can be claimed by another tab; when one recovered queue drains, remaining
  orphan queues are considered. Active tabs never clear each other's records.
  Web Locks require a secure context. If unavailable, the app warns that changes
  cannot be stored safely and keeps them in memory until saved.
- Text is limited to 10,000 UTF-16 code units, positions to ±1,000,000 canvas pixels,
  and request bodies to 64 KiB. Existing size limits remain unchanged. New note
  colors must use the six supported colors. Unexpected fields are rejected.

## Local verification

Run `npm test`, `npm run test:mobile`, `npm run lint`, and `npm run build`.
Rules tests require Java 21 or newer on `PATH` and run with `npm run test:rules`.
They use `demo-notes` and the local database emulator; they do not contact the
production project.

Firebase references: [rule scope and cascading permissions](https://firebase.google.com/docs/database/security/core-syntax),
[presence connection cleanup](https://firebase.google.com/docs/database/web/offline-capabilities).
