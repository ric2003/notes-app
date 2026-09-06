"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { NoteData } from "@/lib/notes";
import { NoteSync, type NoteUpdate } from "@/lib/note-sync";
import { deleteNote, saveNoteUpdate } from "@/lib/note-client";

export function useNoteUpdateQueue({
  setNotes,
}: {
  setNotes: Dispatch<SetStateAction<NoteData[]>>;
}) {
  const [sync] = useState(
    () => new NoteSync({ save: saveNoteUpdate, remove: deleteNote }),
  );
  const status = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot,
  );

  useEffect(() => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {}
    sync.start(storage);
    const handleOnline = () => {
      void sync.flush();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      sync.stop();
      window.removeEventListener("online", handleOnline);
    };
  }, [sync]);

  const updateNote = useCallback(
    (id: string, updates: NoteUpdate) => {
      sync.update(id, updates);
      setNotes((previous) => sync.merge(previous));
    },
    [sync, setNotes],
  );

  return {
    updateNote,
    mergeWithPending: sync.merge,
    flush: sync.flush,
    sync,
    status,
  };
}
