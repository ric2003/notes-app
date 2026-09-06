# Reliable note saving and deletion recovery

Status: resolved

Branch: `release/01-reliable-saving`

Implemented:
- Immediate local persistence of text with debounced network writes.
- Per-note request ordering, including retries and deletion.
- Atomic content conflict checks and explicit local/remote text selection.
- Persistent undo deadlines, failed-delete restoration, and explicit retry.
- Firebase connection monitoring and visible save/recovery states.
- Isolated browser tests that block Firebase and mock all note mutations.

Validation:
- 48 unit/route tests passed.
- Browser checks passed for draft reload recovery, conflict resolution, undo,
  deletion failure after reload, mobile account layout, minimaps, resizing,
  dragging, panning, and pinch gestures.
- TypeScript and production build passed.
- Lint has no errors and the same three existing image warnings.

No deployment or Firebase rule changes are included.
