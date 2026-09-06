# Safer public collaboration

Status: resolved

Branch: `release/02-safer-collaboration`
Base: `release/01-reliable-saving` at `db7b95b`

Implemented:
- Owner-only stars in `noteStars`, isolated from public note writes.
- Account-owned connection records in `presenceV2`, with guest Anonymous Auth,
  profile-derived identity, disconnect cleanup, and stale-record expiry.
- Bounded JSON requests and matching database field validation. Authorship and
  creation timestamps remain immutable, including legacy attribution.
- Web Lock ownership of separate persisted queues per tab, legacy queue
  migration, and recovery of closed-tab work.
- A dismissible public-editing reminder on the board.
- A file-only migration script and coordinated rollout instructions in
  `docs/release-2-rollout.md`.

Validation:
- 62 unit and route tests passed.
- 12 Firebase Realtime Database emulator tests passed, including forged votes,
  unauthorized presence writes, ancestor writes, attribution changes, and actual
  server disconnect cleanup without removing another connection.
- Browser checks passed for independent drafts in two tabs, closed-tab recovery,
  reloads, conflict review, deletion recovery, and existing mobile gestures.
- TypeScript and production build passed. Lint has no errors and the three
  existing image warnings.

Deployment still requires Anonymous Auth configuration, a reviewed data export
and migration, and coordinated app/rules deployment. No production configuration
or data was changed.
