"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { NoteData } from "@/lib/notes";
import {
  mergePendingUpdate,
  overlayPendingUpdates,
  parsePendingUpdates,
  removePersistedUpdate,
  type PendingNoteUpdates,
} from "@/lib/pending-note-updates";

const STORAGE_KEY = "notesAppPendingUpdates";
const RETRY_DELAY_MS = 5_000;

type UseNoteUpdateQueueOptions = {
  saveNote: (noteId: string, updates: Partial<NoteData>) => Promise<void>;
  setNotes: Dispatch<SetStateAction<NoteData[]>>;
  onSaveError: (error: unknown) => void;
};

export function useNoteUpdateQueue({
  saveNote,
  setNotes,
  onSaveError,
}: UseNoteUpdateQueueOptions) {
  const pendingRef = useRef<PendingNoteUpdates>(new Map());
  const isSyncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const saveNoteRef = useRef(saveNote);
  const onSaveErrorRef = useRef(onSaveError);

  useEffect(() => {
    saveNoteRef.current = saveNote;
    onSaveErrorRef.current = onSaveError;
  }, [saveNote, onSaveError]);

  const persist = useCallback((pending: PendingNoteUpdates) => {
    try {
      if (pending.size === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Array.from(pending.entries())),
        );
      }
    } catch {
      // The in-memory queue remains authoritative when storage is unavailable.
    }
  }, []);

  const replacePending = useCallback(
    (next: PendingNoteUpdates) => {
      pendingRef.current = next;
      persist(next);
    },
    [persist],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) pendingRef.current = parsePendingUpdates(stored);
    } catch {
      pendingRef.current = new Map();
    }
  }, []);

  const clearPersistedUpdate = useCallback(
    (noteId: string, expected: Partial<NoteData>) => {
      const next = removePersistedUpdate(pendingRef.current, noteId, expected);
      if (next !== pendingRef.current) replacePending(next);
    },
    [replacePending],
  );

  const scheduleRetry = useCallback(() => {
    if (
      !navigator.onLine ||
      pendingRef.current.size === 0 ||
      retryTimerRef.current !== null
    ) {
      return;
    }

    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushRef.current();
    }, RETRY_DELAY_MS);
  }, []);

  const flush = useCallback(async () => {
    if (isSyncingRef.current || pendingRef.current.size === 0) return;

    isSyncingRef.current = true;
    const queued = [...pendingRef.current.entries()];
    try {
      for (const [noteId, updates] of queued) {
        try {
          await saveNoteRef.current(noteId, updates);
          clearPersistedUpdate(noteId, updates);
        } catch (error) {
          console.error(`Failed to sync update for note ${noteId}:`, error);
        }
      }
    } finally {
      isSyncingRef.current = false;
      scheduleRetry();
    }
  }, [clearPersistedUpdate, scheduleRetry]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const handleOnline = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      void flushRef.current();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const updateNote = useCallback(
    async (noteId: string, updates: Partial<NoteData>) => {
      const { next, merged } = mergePendingUpdate(
        pendingRef.current,
        noteId,
        updates,
      );
      replacePending(next);
      setNotes((previous) =>
        previous.map((note) =>
          note.id === noteId ? { ...note, ...merged } : note,
        ),
      );

      try {
        await saveNoteRef.current(noteId, merged);
        clearPersistedUpdate(noteId, merged);
      } catch (error) {
        console.error("Error updating note:", error);
        onSaveErrorRef.current(error);
        scheduleRetry();
      }
    },
    [clearPersistedUpdate, replacePending, scheduleRetry, setNotes],
  );

  const mergeWithPending = useCallback(
    (notes: NoteData[]) => overlayPendingUpdates(notes, pendingRef.current),
    [],
  );

  return { updateNote, mergeWithPending, flush };
}
