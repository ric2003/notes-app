"use client";

import { useState, useEffect, useRef } from "react";
import {
  ref,
  onValue,
  get,
  push,
  set,
  update as dbUpdate,
  remove,
  serverTimestamp,
} from "firebase/database";
import { db } from "@/lib/firebase";
import { NoteProps } from "@/components/Note";
import UserProfiles from "@/components/UserProfiles";
import { ZoomProvider, useZoom } from "@/contexts/ZoomContext";
import NotesCanvas from "@/components/NotesCanvas";
import ZoomControls from "@/components/ZoomControls";
import { PlusIcon } from "lucide-react";

interface NoteData {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  created_at?: string;
  user_id?: string;
  edited_at?: string;
}

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

  async function loadNotes() {
    try {
      const snapshot = await get(ref(db, "notes"));
      const val = snapshot.val() || {};
      const loaded: NoteData[] = Object.entries(val).map(([id, data]) => {
        const d: any = data || {};
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
          edited_at: new Date(editedMs).toISOString(),
        } as NoteData;
      });
      loaded.sort(
        (a, b) =>
          (a.created_at ? Date.parse(a.created_at) : 0) -
          (b.created_at ? Date.parse(b.created_at) : 0)
      );
      const uniqueNotes = ensureUniqueNotes(loaded);
      console.log(`Loaded ${uniqueNotes.length} unique notes from Realtime DB`);
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
        const updatesToWrite: any = { ...updates };
        if (Object.prototype.hasOwnProperty.call(updatesToWrite, "edited_at")) {
          updatesToWrite.edited_at = serverTimestamp();
        }
        await dbUpdate(ref(db, `notes/${noteId}`), updatesToWrite);
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
    const newNote = {
      content: "",
      color: randomColor(),
      position_x: worldCoords.x,
      position_y: worldCoords.y,
      user_id: null,
      created_at: serverTimestamp(),
      edited_at: serverTimestamp(),
    } as any;

    try {
      const notesRef = ref(db, "notes");
      const newRef = push(notesRef);
      await set(newRef, newNote);
      const newId = newRef.key as string;
      setNotes((prev) => [
        ...prev,
        {
          id: newId,
          content: "",
          color: newNote.color,
          position_x: newNote.position_x,
          position_y: newNote.position_y,
          user_id: undefined,
          created_at: new Date().toISOString(),
          edited_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Error creating note:", error);
    }
  }

  async function updateNoteInDatabase(
    noteId: string,
    updates: Partial<NoteData>
  ) {
    try {
      const updatesToWrite: any = { ...updates };
      if (Object.prototype.hasOwnProperty.call(updatesToWrite, "edited_at")) {
        updatesToWrite.edited_at = serverTimestamp();
      }
      await dbUpdate(ref(db, `notes/${noteId}`), updatesToWrite);
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
      await remove(ref(db, `notes/${noteId}`));
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (error) {
      console.error("Error deleting note:", error);
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

  // Add zoom and pan handlers
  function handleWheel(e: React.WheelEvent) {
    // Prevent browser zoom and only allow our custom zoom
    e.preventDefault();
    e.stopPropagation();

    // Check if this is a pinch gesture (ctrlKey is set on trackpad pinch)
    if (e.ctrlKey) {
      // Handle trackpad pinch-to-zoom
      handleCustomZoom(e, e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    } else {
      // Handle mouse wheel zoom
      handleCustomZoom(e, e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.85);
    }
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
      const newZoom = Math.max(0.2, Math.min(5.0, zoom * scaleFactor));

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
      const newZoom = Math.max(0.2, Math.min(5.0, touchStartZoom * scale));

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
          const d: any = data || {};
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
            edited_at: new Date(editedMs).toISOString(),
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
        />
      </div>

      {/* Floating controls - Top Left */}
      <div
        className="absolute top-4 left-4 z-50 flex flex-col gap-3 prevent-zoom"
        style={{ transform: "scale(1)", transformOrigin: "top left" }}
      >
        <button
          onClick={() => createBox(screen.width / 2, screen.height / 2)}
          className="flex items-center gap-3 px-5 py-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg hover:bg-white hover:shadow-xl hover:scale-105 transition-all duration-200 font-medium text-gray-700"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Create Note</span>
        </button>
      </div>

      {/* Floating controls - Top middle */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-3 prevent-zoom">
        <ZoomControls notes={notes} />
      </div>

      {/* Floating controls - Top Right */}
      <div
        className="absolute top-4 right-4 z-50 flex flex-col gap-3 items-end prevent-zoom"
        style={{ transform: "scale(1)", transformOrigin: "top right" }}
      >
        <UserProfiles isConnected={isConnected} />
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
