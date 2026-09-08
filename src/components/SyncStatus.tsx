"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe2 } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        container.current
          ?.querySelector<HTMLButtonElement>("[aria-expanded]")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const attention = status.problems.length + status.failedDeletes.length;
  const label = attention
    ? `Review changes (${attention})`
    : status.pending && status.storageError
      ? "Keep tab open"
      : status.saving
        ? "Saving…"
        : status.pending
          ? "Waiting to sync"
          : !connected
            ? "Offline"
            : null;
  const lastDelete = status.pendingDeletes.at(-1);
  const buttonClass =
    "min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-indigo-500";
  return (
    <aside
      ref={container}
      className="absolute left-3 z-[65] max-w-[calc(100vw-1.5rem)] sm:left-4"
      style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.75rem)" }}
      aria-label="Note sync"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="board-status-details"
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white/95 px-2.5 text-xs text-gray-600 shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <Globe2 aria-hidden="true" className="h-3.5 w-3.5" />
          Public board
          {label && (
            <span
              role="status"
              className={
                attention || (status.pending && status.storageError)
                  ? "font-medium text-amber-800"
                  : "text-gray-500"
              }
            >
              · {label}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {!open && lastDelete && (
          <button
            type="button"
            disabled={lastDelete.dueAt <= Date.now()}
            className="min-h-11 rounded-lg bg-white/95 px-3 text-xs font-medium text-gray-700 shadow-sm disabled:text-gray-400 focus-visible:outline-2 focus-visible:outline-indigo-500"
            onClick={() => {
              sync.undoDelete(lastDelete.note.id);
              onRestore(lastDelete.note);
            }}
          >
            {lastDelete.dueAt <= Date.now() ? "Deleting…" : "Undo"}
          </button>
        )}
      </div>
      {open && (
        <section
          id="board-status-details"
          aria-label="Board details"
          className="mt-2 max-h-[55dvh] w-80 max-w-full overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <p className="text-sm leading-relaxed text-gray-600">
            Anyone can read and change these notes. Keep private information off
            this board.
          </p>
          {status.storageError && (
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Draft recovery isn’t available in this browser connection. Keep
              the tab open while changes are saving.
            </p>
          )}
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
                      onClick={() => {
                        sync.resolve(problem.id, true);
                        setOpen(false);
                      }}
                    >
                      Keep my text
                    </button>
                  )}
                  <button
                    className={buttonClass}
                    onClick={() => {
                      sync.resolve(problem.id, false);
                      setOpen(false);
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
        </section>
      )}
    </aside>
  );
}
