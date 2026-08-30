"use client";

import { useState, useEffect, useRef } from "react";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "@/lib/firebase";
import UserProfiles from "@/components/UserProfiles";
import { ProfileProvider, useProfile } from "@/contexts/ProfileContext";
import { ZoomProvider } from "@/contexts/ZoomContext";
import NotesCanvas from "@/components/NotesCanvas";
import ZoomControls from "@/components/ZoomControls";
import MiniMap from "@/components/MiniMap";
import MobileMiniMap from "@/components/MobileMiniMap";
import { PlusIcon, AlertTriangle, CheckCircle, Info } from "lucide-react";
import {
  NOTE_COLORS,
  NOTE_COLOR_NAMES,
  type NoteColorName,
} from "@/lib/noteColors";
import { normalizeNotesCollection, type NoteData } from "@/lib/notes";
import { CANVAS_NOTE_HEIGHT, CANVAS_NOTE_WIDTH } from "@/lib/canvas-geometry";
import { saveNoteUpdate } from "@/lib/note-client";
import { useCanvasGestures } from "@/hooks/useCanvasGestures";
import { useNoteUpdateQueue } from "@/hooks/useNoteUpdateQueue";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastItem = {
  id: number;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  action?: ToastAction;
};

function HomeContent() {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [, setLastActivity] = useState(Date.now());
  const { user, profile, profiles } = useProfile();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);

  // Undoable deletes: notes stay in the DB during the grace window, so
  // realtime updates for them must be filtered out until it expires.
  const UNDO_WINDOW_MS = 6000;
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const pendingDeletesRef = useRef<
    Map<string, { note: NoteData; timer: number }>
  >(new Map());

  function showToast(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    durationMs = 2500,
    action?: ToastAction,
  ) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type, action }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, durationMs);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const { updateNote, mergeWithPending, flush } = useNoteUpdateQueue({
    saveNote: saveNoteUpdate,
    setNotes,
    onSaveError: () => {
      showToast("Couldn't save your change — it will be synced later", "error");
    },
  });

  const {
    containerRef,
    isDragging,
    isResizing,
    isPanning,
    handlePointerDownCapture,
    handleNotePointerDown,
    handleNoteResizePointerDown,
    handleNoteResizeKeyDown,
    handlePointerMove,
    handlePointerEnd,
    handleCanvasPointerDown,
    handleWheel,
    screenToWorld,
    mergeWithActiveGeometry,
  } = useCanvasGestures({
    notes,
    setNotes,
    editingNote,
    setEditingNote,
    onNoteGeometryChange: (noteId, updates) => {
      void updateNote(noteId, updates);
    },
  });

  function pickRandomColor(): NoteColorName {
    return NOTE_COLOR_NAMES[
      Math.floor(Math.random() * NOTE_COLOR_NAMES.length)
    ];
  }

  // The plus chip previews the color the next note will get
  const [nextColor, setNextColor] = useState<NoteColorName>(pickRandomColor);

  async function createBox(screenX: number, screenY: number) {
    if (isCreatingRef.current) return;
    if (user && !profile) {
      showToast("Choose your username before creating a note.", "warning");
      return;
    }
    isCreatingRef.current = true;
    setIsCreating(true);

    const worldCoords = screenToWorld(screenX, screenY);
    const body = {
      content: "",
      color: nextColor,
      // Center the note around the screen/world point
      position_x: worldCoords.x - CANVAS_NOTE_WIDTH / 2,
      position_y: worldCoords.y - CANVAS_NOTE_HEIGHT / 2,
      width: CANVAS_NOTE_WIDTH,
      height: CANVAS_NOTE_HEIGHT,
      author_id: user?.uid ?? null,
    };
    // Queue up a different shade for the note after this one
    setNextColor(pickRandomColor());

    try {
      const authToken = user ? await user.getIdToken() : null;
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const created = data?.note as NoteData | undefined;
      if (created) {
        setNotes((prev) =>
          prev.some((n) => n.id === created.id) ? prev : [...prev, created],
        );
      }
    } catch (error) {
      console.error("Error creating note:", error);
      showToast("Couldn't create note — please try again", "error");
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  }

  async function toggleStar(noteId: string) {
    const uid = user?.uid;
    if (!uid) {
      showToast("Please log in to star notes.", "warning");
      return;
    }

    // Optimistic UI update
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const currentStars = n.stars || {};
        const isStarred = !!currentStars[uid];
        const nextStars = { ...currentStars } as Record<string, boolean>;
        if (isStarred) {
          delete nextStars[uid];
        } else {
          nextStars[uid] = true;
        }
        return { ...n, stars: nextStars };
      }),
    );

    try {
      const starRef = ref(db, `notes/${noteId}/stars/${uid}`);
      await runTransaction(starRef, (current) => {
        return current ? null : true;
      });
    } catch (error) {
      console.error("Failed to toggle star:", error);
    }
  }

  function handleNoteChange(noteId: string, content: string) {
    void updateNote(noteId, {
      content,
      edited_at: new Date().toISOString(),
    });
  }

  function handleNoteEdit(noteId: string) {
    setEditingNote(noteId);
  }

  function handleNoteDelete(noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // Remove locally right away so the delete feels instant
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    pendingDeleteIdsRef.current.add(noteId);

    const timer = window.setTimeout(() => {
      finalizeDelete(noteId);
    }, UNDO_WINDOW_MS);
    pendingDeletesRef.current.set(noteId, { note, timer });

    showToast("Note deleted", "info", UNDO_WINDOW_MS, {
      label: "Undo",
      onClick: () => undoDelete(noteId),
    });
  }

  function undoDelete(noteId: string) {
    const entry = pendingDeletesRef.current.get(noteId);
    if (!entry) return; // already finalized
    window.clearTimeout(entry.timer);
    pendingDeletesRef.current.delete(noteId);
    pendingDeleteIdsRef.current.delete(noteId);
    // Realtime feed will re-deliver it; add optimistically too
    setNotes((prev) =>
      prev.some((n) => n.id === noteId)
        ? prev
        : [...prev, entry.note].sort(
            (a, b) =>
              (a.created_at ? Date.parse(a.created_at) : 0) -
              (b.created_at ? Date.parse(b.created_at) : 0),
          ),
    );
  }

  function finalizeDelete(noteId: string) {
    pendingDeletesRef.current.delete(noteId);
    pendingDeleteIdsRef.current.delete(noteId);
    fetch(`/api/notes/${noteId}`, { method: "DELETE" }).catch((error) => {
      console.error("Error deleting note:", error);
      showToast("Failed to delete note on server", "error");
    });
  }

  function handleColorChange(noteId: string, newColor: string) {
    void updateNote(noteId, {
      color: newColor,
      edited_at: new Date().toISOString(),
    });
  }

  function handleCanvasClick(e: React.MouseEvent) {
    // Only create notes with double-click to avoid conflicts with panning
    if (
      e.target === e.currentTarget &&
      !isPanning &&
      !isDragging &&
      e.detail === 2
    ) {
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        createBox(screenX, screenY);
      }
    }
  }

  useEffect(() => {
    const fixture =
      process.env.NODE_ENV !== "production"
        ? (
            window as Window & {
              __NOTES_CANVAS_TEST_NOTES__?: NoteData[];
            }
          ).__NOTES_CANVAS_TEST_NOTES__
        : undefined;
    if (fixture) {
      setNotes(
        normalizeNotesCollection(
          Object.fromEntries(fixture.map((note) => [note.id, note])),
        ),
      );
      return;
    }

    let cancelled = false;
    let realtimeDelivered = false;

    const loadInitialNotes = async () => {
      try {
        const response = await fetch("/api/notes", { method: "GET" });
        if (!response.ok) {
          throw new Error(`Failed to load notes: ${response.status}`);
        }
        const data = (await response.json()) as { notes?: unknown };
        const loaded = Array.isArray(data.notes) ? data.notes : [];
        const normalized = mergeWithActiveGeometry(
          mergeWithPending(
            normalizeNotesCollection(
              Object.fromEntries(
                loaded
                  .filter((note): note is Record<string, unknown> =>
                    Boolean(note && typeof note === "object"),
                  )
                  .map((note) => [String(note.id ?? ""), note]),
              ),
            ).filter((note) => !pendingDeleteIdsRef.current.has(note.id)),
          ),
        );
        if (!cancelled && !realtimeDelivered) {
          setNotes(normalized);
        }
      } catch (error) {
        console.error("Error loading notes:", error);
      }
    };

    void loadInitialNotes();

    const notesRef = ref(db, "notes");
    const unsubscribe = onValue(
      notesRef,
      (snapshot) => {
        realtimeDelivered = true;
        setIsConnected(true);
        setLastActivity(Date.now());
        setNotes(
          mergeWithActiveGeometry(
            mergeWithPending(
              normalizeNotesCollection(snapshot.val()).filter(
                (note) => !pendingDeleteIdsRef.current.has(note.id),
              ),
            ),
          ),
        );
        void flush();
      },
      (error) => {
        console.error("Realtime subscription error:", error);
        setIsConnected(false);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [flush, mergeWithActiveGeometry, mergeWithPending]);

  return (
    <div
      className="relative w-screen overflow-hidden prevent-zoom"
      style={{ height: "100dvh" }}
    >
      {/* Full-screen canvas */}
      <div
        ref={containerRef}
        className={`absolute inset-0 prevent-zoom ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={handleWheel}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleCanvasClick}
      >
        <NotesCanvas
          notes={notes}
          isDragging={isDragging}
          isResizing={isResizing}
          editingNote={editingNote}
          onPointerDown={handleNotePointerDown}
          onResizePointerDown={handleNoteResizePointerDown}
          onResizeKeyDown={handleNoteResizeKeyDown}
          onNoteEdit={handleNoteEdit}
          onNoteDelete={handleNoteDelete}
          onNoteChange={handleNoteChange}
          onColorChange={handleColorChange}
          onEditSave={() => setEditingNote(null)}
          onCanvasPointerDown={handleCanvasPointerDown}
          currentUserId={user?.uid || undefined}
          profiles={profiles}
          onToggleStar={toggleStar}
        />
      </div>

      {/* Floating controls - Top Left and Right */}
      <div
        className="absolute z-[70] flex w-full flex-row justify-between gap-2 px-3 sm:px-4 prevent-zoom"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              createBox(rect.width / 2, rect.height / 2);
            } else {
              createBox(window.innerWidth / 2, window.innerHeight / 2);
            }
          }}
          disabled={isCreating}
          aria-label={isCreating ? "Creating note" : "Create note"}
          className="group flex h-14 min-w-11 shrink-0 items-center justify-center gap-2 px-3 py-2.5 font-medium text-gray-700 bg-white/95 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg hover:shadow-xl hover:bg-white transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-indigo-500 sm:gap-2.5 sm:px-5"
        >
          <div
            className="p-1 rounded-lg shadow-sm transition-colors duration-300 group-hover:scale-102"
            style={{ backgroundColor: NOTE_COLORS[nextColor].bg }}
          >
            <PlusIcon
              className={`w-4 h-4 text-gray-800/70 ${isCreating ? "animate-pulse" : ""}`}
            />
          </div>
          <span className="text-sm sm:hidden">
            {isCreating ? "..." : "Note"}
          </span>
          <span className="hidden sm:inline">
            {isCreating ? "Creating..." : "Create Note"}
          </span>
        </button>

        <UserProfiles isConnected={isConnected} />
      </div>
      <div
        className="hidden md:pointer-fine:block absolute left-1/2 -translate-x-1/2 z-50 prevent-zoom"
        style={{ top: "max(1rem, env(safe-area-inset-top))" }}
      >
        <ZoomControls notes={notes} />
      </div>

      {/* Minimap for navigating distant notes */}
      <div className="hidden pointer-fine:block absolute bottom-4 left-4 z-50 prevent-zoom">
        <MiniMap notes={notes} />
      </div>

      <div
        className="md:pointer-fine:hidden absolute inset-x-3 z-50 flex items-end justify-center gap-2 prevent-zoom"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <ZoomControls notes={notes} compactOnNarrowScreens />
        <MobileMiniMap notes={notes} />
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 z-[60] flex w-full max-w-md flex-col items-center gap-2 px-4"
        style={{ top: "calc(env(safe-area-inset-top) + 5rem)" }}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex max-w-full items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border backdrop-blur-xl animate-scale-in
              ${t.type === "success" ? "bg-emerald-50/95 border-emerald-200" : ""}
              ${t.type === "info" ? "bg-sky-50/95 border-sky-200" : ""}
              ${t.type === "warning" ? "bg-amber-50/95 border-amber-200" : ""}
              ${t.type === "error" ? "bg-rose-50/95 border-rose-200" : ""}
            `}
          >
            <div
              className={`w-5 h-5 flex items-center justify-center
                ${t.type === "success" ? "text-emerald-500" : ""}
                ${t.type === "info" ? "text-sky-500" : ""}
                ${t.type === "warning" ? "text-amber-500" : ""}
                ${t.type === "error" ? "text-rose-500" : ""}
              `}
            >
              {t.type === "success" ? (
                <CheckCircle className="w-5 h-5" />
              ) : t.type === "info" ? (
                <Info className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <span className="min-w-0 break-words text-sm font-medium text-gray-700">
              {t.message}
            </span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="ml-1 px-2 py-0.5 rounded-lg bg-white/80 border border-gray-300 text-xs font-semibold text-gray-800 hover:bg-white transition-colors"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Wordmark + purpose — also satisfies Google OAuth branding checks */}
      <div className="hidden pointer-fine:block fixed bottom-1 left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none select-none">
        <span className="text-xs font-semibold text-gray-500">Live Notes</span>
        <span className="hidden sm:inline text-[11px] text-gray-400">
          {" "}
          · a real-time shared sticky-note board
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    // Set initial dimensions from window
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    // Update dimensions on window resize
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <ProfileProvider>
      <ZoomProvider
        containerWidth={dimensions.width}
        containerHeight={dimensions.height}
      >
        <HomeContent />
      </ZoomProvider>
    </ProfileProvider>
  );
}
