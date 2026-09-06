# Release 2: Safer collaboration

Branch: `release/02-safer-collaboration`
Base: `release/01-reliable-saving` at `db7b95b`

Keep public reading and note editing. Enforce account ownership of stars and
presence, validate note data at both routes and database rules, represent each
connection independently, explain public editing in the board UI, and isolate
persistent save queues between tabs with recovery of closed-tab work.

No live deployment is included. The rollout needs versioned presence and star
paths, Anonymous Auth for guest presence, and an explicit legacy-data migration.
