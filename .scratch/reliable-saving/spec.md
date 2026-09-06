# Release 1: Reliable saving

Branch: `release/01-reliable-saving`

Preserve typed text, serialize writes per note, detect conflicting text edits,
recover failed deletes, and display accurate connection and sync state.

Acceptance:
- Every keystroke is queued locally before a debounced network save.
- An older save cannot finish after a newer save for the same note.
- Conflicting text is retained for explicit review, including after reload.
- Deletes retain the six-second undo window and survive reloads.
- Failed deletes restore the note and offer retry.
- Connection status follows Firebase's connection signal. Pending, saving,
  conflict, and local-storage failure states must not claim everything is saved.
- Regression tests cover ordering, conflicts, retries, undo, and reload recovery.

Later releases use separate branches based on completed earlier work:
`release/02-safer-collaboration`, `release/03-everyday-usability`,
`release/04-recovery-organization`, `release/05-scale-polish`.

Implementation notes:
- Updates use Firebase ETags and conditional writes. A concurrent text change
  returns a conflict; unrelated changes such as stars are preserved on retry.
  See https://firebase.google.com/docs/database/rest/save-data.
- Pending deletions resume when the app is reopened. A closed browser cannot
  send the deletion at the original deadline.
- Browser-wide queue storage is retained for compatibility. Coordinating
  competing queues in multiple tabs remains follow-up work for release 2.
- Conditional writes add a database read to each update. Measure this alongside
  the subscription and rendering work in release 5.
