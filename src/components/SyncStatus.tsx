"use client";

import type { NoteData } from "@/lib/notes";
import type { NoteSync } from "@/lib/note-sync";

type Props = {
  sync: NoteSync;
  status: ReturnType<NoteSync["getSnapshot"]>;
  connected: boolean;
  onRestore: (note: NoteData) => void;
};

export default function SyncStatus({
  sync,
  status,
  connected,
  onRestore,
}: Props) {
  const attention = status.problems.length + status.failedDeletes.length;
  const label = attention
    ? "Changes need review"
    : status.saving
      ? "Saving…"
      : status.pending
        ? "Changes waiting to sync"
        : connected
          ? "Saved"
          : "Disconnected";
  const buttonClass =
    "min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-indigo-500";
  return (
    <aside
      className="absolute left-3 z-[65] max-w-[calc(100vw-1.5rem)] sm:left-4"
      style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 4rem)" }}
      aria-label="Note sync"
    >
      <div
        role="status"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-1 text-xs text-gray-700 shadow-sm"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {label}
        {!connected && status.pending > 0 ? " · Disconnected" : ""}
      </div>
      {status.storageError && (
        <p
          role="alert"
          className="mt-1 max-w-xs rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
        >
          Browser storage is unavailable. Keep this tab open until your changes
          finish saving.
        </p>
      )}
      {(attention > 0 || status.pendingDeletes.length > 0) && (
        <details
          open
          className="mt-2 max-h-[55dvh] w-80 max-w-full overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <summary className="cursor-pointer text-sm font-medium">
            {attention ? "Review changes" : "Pending deletion"}
          </summary>
          <div className="mt-2 space-y-4">
            {status.pendingDeletes.map(({ note, dueAt }) => (
              <div key={note.id} className="space-y-2 text-sm">
                <p className="truncate">
                  Deleting: {note.content || "Empty note"}
                </p>
                <button
                  disabled={dueAt <= Date.now()}
                  className={`${buttonClass} disabled:opacity-50`}
                  onClick={() => {
                    sync.undoDelete(note.id);
                    onRestore(note);
                  }}
                >
                  {dueAt <= Date.now() ? "Deleting…" : "Undo"}
                </button>
              </div>
            ))}
            {status.failedDeletes.map(({ note }) => (
              <div key={note.id} className="space-y-2 text-sm">
                <p>
                  Couldn&apos;t delete &quot;
                  {note.content.slice(0, 50) || "Empty note"}&quot;. The note is
                  back on the board.
                </p>
                <div className="flex gap-2">
                  <button
                    className={buttonClass}
                    onClick={() => {
                      sync.retryDelete(note.id);
                      onRestore(note);
                    }}
                  >
                    Retry delete
                  </button>
                  <button
                    className={buttonClass}
                    onClick={() => {
                      sync.undoDelete(note.id);
                      onRestore(note);
                    }}
                  >
                    Keep note
                  </button>
                </div>
              </div>
            ))}
            {status.problems.map((problem) => (
              <div key={problem.id} className="space-y-2 text-sm">
                <p>{problem.message}</p>
                {problem.updates.content !== undefined && (
                  <label className="block">
                    Your text
                    <textarea
                      aria-label="Your unsynced text"
                      readOnly
                      value={problem.updates.content}
                      className="mt-1 block min-h-20 w-full resize-y rounded border p-2 text-base"
                    />
                  </label>
                )}
                {problem.remote && (
                  <label className="block">
                    Latest saved text
                    <textarea
                      aria-label="Latest saved text"
                      readOnly
                      value={problem.remote.content}
                      className="mt-1 block min-h-20 w-full resize-y rounded border p-2 text-base"
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {problem.remote && (
                    <button
                      className={buttonClass}
                      onClick={() => sync.resolve(problem.id, true)}
                    >
                      Keep my text
                    </button>
                  )}
                  <button
                    className={buttonClass}
                    onClick={() => {
                      sync.resolve(problem.id, false);
                      if (problem.remote) onRestore(problem.remote);
                    }}
                  >
                    {problem.remote
                      ? "Use latest text"
                      : "Discard unsynced change"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </aside>
  );
}
