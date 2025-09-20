"use client";

import { useState, useEffect, useRef } from "react";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "@/lib/firebase";
import { NoteProps } from "@/components/Note";
import UserProfiles from "@/components/UserProfiles";
import { ZoomProvider, useZoom } from "@/contexts/ZoomContext";
import NotesCanvas from "@/components/NotesCanvas";
import ZoomControls from "@/components/ZoomControls";
import { PlusIcon, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

interface NoteData {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  created_at?: string;
  user_id?: string;
  user_name?: string;
  edited_at?: string;
  stars?: Record<string, boolean>;
}

type ToastItem = {
  id: number;
  message: string;
  type?: "info" | "success" | "warning" | "error";
};

function HomeContent() {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 20, y: 20 });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [, setLastActivity] = useState(Date.now());
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, Partial<NoteData>>
  >(new Map());
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [touchStartDistance, setTouchStartDistance] = useState(0);
  const [touchStartZoom, setTouchStartZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const { zoom, panX, panY, setPan, setZoom, screenToWorld } = useZoom();
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function showToast(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    durationMs = 2500
  ) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Helper function to ensure unique notes by ID
  const ensureUniqueNotes = (notesArray: NoteData[]): NoteData[] => {
    const uniqueMap = new Map<string, NoteData>();
    notesArray.forEach((note) => {
      if (!uniqueMap.has(note.id)) {
        uniqueMap.set(note.id, note);
      }
    });
    return Array.from(uniqueMap.values());
  };

  function randomColor() {
    const colors: NoteProps["color"][] = [
      "blue",
      "green",
      "pink",
      "purple",
      "orange",
      "yellow",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Note dimensions (should match `w-80` and `min-h-56` from `Note.tsx`)
  const NOTE_WIDTH = 320;
  const NOTE_HEIGHT = 224;

  async function loadNotes() {
    try {
      const res = await fetch("/api/notes", { method: "GET" });
      if (!res.ok) throw new Error(`Failed to load notes: ${res.status}`);
      const data = await res.json();
      const loaded: NoteData[] = Array.isArray(data?.notes) ? data.notes : [];
      const uniqueNotes = ensureUniqueNotes(loaded);
      console.log(`Loaded ${uniqueNotes.length} unique notes via API`);
      setNotes(uniqueNotes);
    } catch (error) {
      console.error("Error loading notes:", error);
    }
  }

  async function syncPendingUpdates() {
    if (pendingUpdates.size === 0) return;

    console.log(`Syncing ${pendingUpdates.size} pending updates...`);

    for (const [noteId, updates] of pendingUpdates.entries()) {
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...updates }),
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        console.log(`Synced update for note ${noteId}`);
      } catch (error) {
        console.error(`Failed to sync update for note ${noteId}:`, error);
      }
    }

    // Clear pending updates after syncing
    setPendingUpdates(new Map());
  }

  async function createBox(screenX: number, screenY: number) {
    // Convert screen coordinates to world coordinates
    const worldCoords = screenToWorld(screenX, screenY);
    const body = {
      content: "",
      color: randomColor(),
      // Center the note around the screen/world point
      position_x: worldCoords.x - NOTE_WIDTH / 2,
      position_y: worldCoords.y - NOTE_HEIGHT / 2,
      user_id: user?.uid ?? null,
      user_name: user?.displayName || user?.email || null,
    };

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const created = data?.note as NoteData | undefined;
      if (created) {
        setNotes((prev) => [...prev, created]);
      }
    } catch (error) {
      console.error("Error creating note:", error);
    }
  }

  async function updateNoteInDatabase(
    noteId: string,
    updates: Partial<NoteData>
  ) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setNotes((prev) =>
        prev.map((note) =>
          note.id === noteId ? { ...note, ...updates } : note
        )
      );
    } catch (error) {
      console.error("Error updating note:", error);
    }
  }

  async function deleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (error) {
      console.error("Error deleting note:", error);
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
      })
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

  function handleMouseDown(e: React.MouseEvent, noteId: string) {
    const target = e.target as HTMLElement;

    // Check if clicked on drag handle OR if it's not on an interactive element
    const isDragHandle = target.closest(".note-drag-handle");
    const isInteractiveElement = target.closest("button, textarea, input");

    if (isDragHandle || (!isInteractiveElement && e.button === 0)) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(noteId);

      // Calculate drag offset in world coordinates for accurate dragging
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const note = notes.find((n) => n.id === noteId);
        if (note) {
          const mouseScreenPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };

          // Convert mouse position to world coordinates
          const mouseWorldPos = screenToWorld(
            mouseScreenPos.x,
            mouseScreenPos.y
          );

          // Calculate offset in world coordinates
          setDragOffset({
            x: mouseWorldPos.x - note.position_x,
            y: mouseWorldPos.y - note.position_y,
          });
        }
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    console.log("🖱️ Parent MouseMove:", {
      isPanning,
      isDragging,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (isPanning) {
      console.log("🔄 Panning:", {
        deltaX: e.clientX - lastPanPoint.x,
        deltaY: e.clientY - lastPanPoint.y,
        newPanX: panX + (e.clientX - lastPanPoint.x),
        newPanY: panY + (e.clientY - lastPanPoint.y),
      });
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;
      setPan(panX + deltaX, panY + deltaY);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    } else if (isDragging && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const mouseScreenPos = {
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      };

      // Convert to world coordinates and subtract the offset
      const mouseWorldPos = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
      const newPosition = {
        x: mouseWorldPos.x - dragOffset.x,
        y: mouseWorldPos.y - dragOffset.y,
      };

      setNotes((prev) =>
        prev.map((note) =>
          note.id === isDragging
            ? { ...note, position_x: newPosition.x, position_y: newPosition.y }
            : note
        )
      );
    }
  }

  function handleMouseUp() {
    if (isDragging) {
      const note = notes.find((n) => n.id === isDragging);
      if (note) {
        const updates = {
          position_x: note.position_x,
          position_y: note.position_y,
        };

        if (isConnected) {
          // If connected, update database immediately
          updateNoteInDatabase(isDragging, updates);
        } else {
          // If offline, store update for later sync
          setPendingUpdates((prev) => new Map(prev.set(isDragging, updates)));
        }
      }
      setIsDragging(null);
    }
    setIsPanning(false);
  }

  function handleNoteChange(noteId: string, content: string) {
    updateNoteInDatabase(noteId, {
      content,
      edited_at: new Date().toISOString(),
    });
  }

  function handleNoteEdit(noteId: string) {
    setEditingNote(noteId);
  }

  function handleNoteDelete(noteId: string) {
    deleteNote(noteId);
  }

  function handleColorChange(noteId: string, newColor: string) {
    updateNoteInDatabase(noteId, {
      color: newColor,
      edited_at: new Date().toISOString(),
    });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleCustomZoom(e, e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.85);
  }

  function handleCustomZoom(
    e: React.WheelEvent,
    clientX: number,
    clientY: number,
    scaleFactor: number
  ) {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      // Zoom centered on mouse/touch position
      const newZoom = Math.max(0.1, Math.min(1.0, zoom * scaleFactor));

      // Adjust pan to keep mouse position fixed
      const newPanX = mouseX - (mouseX - panX) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - panY) * (newZoom / zoom);

      setZoom(newZoom);
      setPan(newPanX, newPanY);
    }
  }

  // Touch handlers for mobile/trackpad
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Two finger pinch - prevent browser zoom
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setTouchStartDistance(distance);
      setTouchStartZoom(zoom);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && touchStartDistance > 0) {
      // Two finger pinch - prevent browser zoom
      e.preventDefault();
      e.stopPropagation();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      const scale = distance / touchStartDistance;
      const newZoom = Math.max(0.1, Math.min(1.0, touchStartZoom * scale));

      // Center zoom between the two touches
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;

        const newPanX = mouseX - (mouseX - panX) * (newZoom / zoom);
        const newPanY = mouseY - (mouseY - panY) * (newZoom / zoom);

        setZoom(newZoom);
        setPan(newPanX, newPanY);
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      setTouchStartDistance(0);
      setTouchStartZoom(1);
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    console.log("🖱️ Canvas MouseDown:", {
      button: e.button,
      ctrlKey: e.ctrlKey,
      isSpacePressed,
      target: e.target,
      currentTarget: e.currentTarget,
      shouldStartPanning: e.button === 1 || e.button === 0,
    });

    // Allow panning with left click anywhere on canvas or middle mouse button
    if (e.button === 1 || e.button === 0) {
      console.log("🚀 Starting pan!");
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }

  // Handle keyboard shortcuts and prevent browser zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't prevent space if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (e.code === "Space" && !e.repeat && !isTyping) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Prevent browser zoom shortcuts
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "0")
      ) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    // Prevent browser zoom on wheel with ctrl/cmd
    const handleDocumentWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("wheel", handleDocumentWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("wheel", handleDocumentWheel);
    };
  }, []);

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
    loadNotes();
    const unsub = setupRealtimeSubscription();
    unsubscribeRef.current = unsub;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  function setupRealtimeSubscription(): () => void {
    const notesRef = ref(db, "notes");
    const unsubscribe = onValue(
      notesRef,
      (snapshot) => {
        setIsConnected(true);
        setLastActivity(Date.now());
        const val = snapshot.val() || {};
        const updated: NoteData[] = Object.entries(val).map(([id, data]) => {
          const d = data as {
            content?: string;
            color?: string;
            position_x?: number;
            position_y?: number;
            created_at?: number;
            edited_at?: number;
            user_id?: string | null;
            user_name?: string | null;
            stars?: Record<string, boolean>;
          };
          const createdMs =
            typeof d.created_at === "number" ? d.created_at : Date.now();
          const editedMs =
            typeof d.edited_at === "number" ? d.edited_at : createdMs;
          return {
            id,
            content: d.content ?? "",
            color: d.color ?? "blue",
            position_x: d.position_x ?? 0,
            position_y: d.position_y ?? 0,
            created_at: new Date(createdMs).toISOString(),
            user_id: d.user_id ?? undefined,
            user_name: d.user_name ?? undefined,
            edited_at: new Date(editedMs).toISOString(),
            stars: d.stars || undefined,
          } as NoteData;
        });
        updated.sort(
          (a, b) =>
            (a.created_at ? Date.parse(a.created_at) : 0) -
            (b.created_at ? Date.parse(b.created_at) : 0)
        );
        setNotes(ensureUniqueNotes(updated));
        if (pendingUpdates.size > 0) {
          syncPendingUpdates();
        }
      },
      (error) => {
        console.error("Realtime subscription error:", error);
        setIsConnected(false);
      }
    );
    return unsubscribe;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden prevent-zoom">
      {/* Full-screen canvas */}
      <div
        ref={containerRef}
        className={`absolute inset-0 prevent-zoom ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <NotesCanvas
          notes={notes}
          isDragging={isDragging}
          editingNote={editingNote}
          onMouseDown={handleMouseDown}
          onNoteEdit={handleNoteEdit}
          onNoteDelete={handleNoteDelete}
          onNoteChange={handleNoteChange}
          onColorChange={handleColorChange}
          onEditSave={() => setEditingNote(null)}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onCanvasMouseDown={handleCanvasMouseDown}
          currentUserId={user?.uid || undefined}
          onToggleStar={toggleStar}
        />
      </div>

      {/* Floating controls - Top Left and Center */}
      <div
        className="absolute top-4 z-50 w-full px-4 flex flex-row justify-between prevent-zoom"
        style={{ transform: "scale(1)", transformOrigin: "top left" }}
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
          className="flex items-center gap-3 px-5 py-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg hover:bg-white hover:shadow-xl hover:scale-105 transition-all duration-200 font-medium text-gray-700"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Create Note</span>
        </button>

        <UserProfiles isConnected={isConnected} />
      </div>

      {/* Centered Zoom Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 prevent-zoom">
        <ZoomControls notes={notes} />
      </div>

      {/* Toasts - Absolute positioned, themed */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm
              ${t.type === "success" ? "bg-white/90 border-green-200" : ""}
              ${t.type === "info" ? "bg-white/90 border-blue-200" : ""}
              ${t.type === "warning" ? "bg-white/90 border-yellow-200" : ""}
              ${t.type === "error" ? "bg-white/90 border-red-200" : ""}
            `}
          >
            <div className="w-5 h-5 text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-800">
              {t.message}
            </span>
          </div>
        ))}
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
    <ZoomProvider
      containerWidth={dimensions.width}
      containerHeight={dimensions.height}
    >
      <HomeContent />
    </ZoomProvider>
  );
}
