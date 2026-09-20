"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { acquireQueue, type QueueLease } from "@/lib/tab-queue-storage";
import type { NoteData } from "@/lib/notes";
import { NoteSync, NoteSaveError, type NoteUpdate } from "@/lib/note-sync";
import { auth } from "@/lib/firebase";
import { deleteNote, saveNoteUpdate, createNote } from "@/lib/note-client";

export function useNoteUpdateQueue({
  setNotes,
}: {
  setNotes: Dispatch<SetStateAction<NoteData[]>>;
}) {
  const [isQueueReady, setIsQueueReady] = useState(false);
  const [sync] = useState(
    () =>
      new NoteSync({
        save: saveNoteUpdate,
        remove: deleteNote,
        create: async (note) => {
          await auth.authStateReady();
          const user = auth.currentUser;
          if (note.author_id && user?.uid !== note.author_id)
            throw new NoteSaveError(
              "Sign in to the account that created this draft to save it.",
              401,
            );
          await createNote(
            note,
            note.author_id && user ? await user.getIdToken() : null,
          );
        },
      }),
  );
  const status = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot,
  );

  useEffect(() => {
    let disposed = false;
    let lease: QueueLease | null = null;
    let recovering = false;
    let unsubscribe = () => {};
    async function recover(recoverOnly = false) {
      if (disposed || recovering) return;
      recovering = true;
      try {
        if (!navigator.locks) throw new Error("Tab coordination unavailable");
        const next = await acquireQueue(
          {
            local: localStorage,
            session: sessionStorage,
            locks: navigator.locks,
            uuid: () => crypto.randomUUID(),
          },
          recoverOnly,
        );
        if (!next) return;
        // New typing while an orphan is being claimed belongs to the current queue.
        const current = sync.getSnapshot();
        if (
          disposed ||
          (recoverOnly &&
            (current.pending || current.saving || current.failedDeletes.length))
        ) {
          next.release();
          return;
        }
        const previous = lease;
        lease = next;
        sync.start(next.storage);
        setNotes((notes) => sync.merge(notes));
        previous?.release();
      } catch {
        if (!disposed && !lease) sync.start();
      } finally {
        recovering = false;
        if (!disposed && !recoverOnly) setIsQueueReady(true);
      }
    }
    void recover();
    unsubscribe = sync.subscribe(() => {
      const state = sync.getSnapshot();
      if (!state.pending && !state.saving && !state.failedDeletes.length)
        void recover(true);
    });
    const handleOnline = () => {
      void sync.flush();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      disposed = true;
      unsubscribe();
      void sync.stop().finally(() => lease?.release());
      window.removeEventListener("online", handleOnline);
    };
  }, [sync, setNotes]);

  const updateNote = useCallback(
    (id: string, updates: NoteUpdate) => {
      sync.update(id, updates);
      setNotes((previous) => sync.merge(previous));
    },
    [sync, setNotes],
  );

  return {
    updateNote,
    isQueueReady,
    mergeWithPending: sync.merge,
    flush: sync.flush,
    sync,
    status,
  };
}
