"use client";

import { useState, useEffect, useRef } from "react";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "@/lib/firebase";
import UserProfiles from "@/components/UserProfiles";
import { ZoomProvider, useZoom } from "@/contexts/ZoomContext";
import NotesCanvas from "@/components/NotesCanvas";
import ZoomControls from "@/components/ZoomControls";
import MiniMap from "@/components/MiniMap";
import { PlusIcon, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  NOTE_COLORS,
  NOTE_COLOR_NAMES,
  type NoteColorName,
} from "@/lib/noteColors";
import { normalizeNotesCollection, type NoteData } from "@/lib/notes";
import {
  calculatePinchTransform,
  CANVAS_NOTE_HEIGHT,
  CANVAS_NOTE_WIDTH,
  distanceBetween,
  MAX_CANVAS_ZOOM,
  midpointBetween,
  MIN_CANVAS_ZOOM,
  type CanvasPoint,
} from "@/lib/canvas-geometry";

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
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [, setLastActivity] = useState(Date.now());
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, Partial<NoteData>>
  >(new Map());
  const pendingUpdatesRef = useRef(pendingUpdates);
  const isSyncingPendingUpdatesRef = useRef(false);
  const pendingRetryTimerRef = useRef<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPointRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const { zoom, panX, panY, setPan, setZoom } = useZoom();
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const panRafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pinchRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDragRef = useRef<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);
  const pendingPinchRef = useRef<{
    zoom: number;
    pan: CanvasPoint;
  } | null>(null);
  const activePanPointerIdRef = useRef<number | null>(null);
  const activeDragPointerIdRef = useRef<number | null>(null);
  const panCaptureTargetRef = useRef<Element | null>(null);
  const dragCaptureTargetRef = useRef<Element | null>(null);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<CanvasPoint>({ x: 20, y: 20 });
  const dragStartPositionRef = useRef<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);
  const latestDragPositionRef = useRef<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);
  const activeTouchPointersRef = useRef<Map<number, CanvasPoint>>(new Map());
  const pinchGestureRef = useRef<{
    pointerIds: [number, number];
    startDistance: number;
    startZoom: number;
    startPan: CanvasPoint;
    startCenter: CanvasPoint;
  } | null>(null);
  const suppressTouchUntilReleaseRef = useRef(false);
  const panStateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomStateRef = useRef<number>(1);

  // Undoable deletes: notes stay in the DB during the grace window, so
  // realtime updates for them must be filtered out until it expires.
  const UNDO_WINDOW_MS = 6000;
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const pendingDeletesRef = useRef<
    Map<string, { note: NoteData; timer: number }>
  >(new Map());

  useEffect(() => {
    panStateRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  useEffect(() => {
    zoomStateRef.current = zoom;
  }, [zoom]);

  // Persist the offline queue so a refresh doesn't lose edits
  const PENDING_UPDATES_KEY = "notesAppPendingUpdates";
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PENDING_UPDATES_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as [string, Partial<NoteData>][];
        setPendingUpdates(new Map(entries));
      }
    } catch {
      // Corrupt or unavailable storage; start clean
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    pendingUpdatesRef.current = pendingUpdates;
    if (!hydratedRef.current) return;
    try {
      if (pendingUpdates.size === 0) {
        window.localStorage.removeItem(PENDING_UPDATES_KEY);
      } else {
        window.localStorage.setItem(
          PENDING_UPDATES_KEY,
          JSON.stringify(Array.from(pendingUpdates.entries())),
        );
      }
    } catch {
      // Storage full or blocked; queue still lives in memory
    }
  }, [pendingUpdates]);

  // Retry the offline queue when connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      if (pendingRetryTimerRef.current !== null) {
        window.clearTimeout(pendingRetryTimerRef.current);
        pendingRetryTimerRef.current = null;
      }
      void syncPendingUpdates();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  function pickRandomColor(): NoteColorName {
    return NOTE_COLOR_NAMES[
      Math.floor(Math.random() * NOTE_COLOR_NAMES.length)
    ];
  }

  // The plus chip previews the color the next note will get
  const [nextColor, setNextColor] = useState<NoteColorName>(pickRandomColor);

  function replacePendingUpdates(next: Map<string, Partial<NoteData>>) {
    pendingUpdatesRef.current = next;
    setPendingUpdates(next);
  }

  function queuePendingUpdate(noteId: string, updates: Partial<NoteData>) {
    const queuedUpdate = {
      ...pendingUpdatesRef.current.get(noteId),
      ...updates,
    };
    const next = new Map(pendingUpdatesRef.current);
    next.set(noteId, queuedUpdate);
    replacePendingUpdates(next);
    return queuedUpdate;
  }

  function clearPendingUpdate(noteId: string, expected: Partial<NoteData>) {
    if (pendingUpdatesRef.current.get(noteId) !== expected) return;
    const next = new Map(pendingUpdatesRef.current);
    next.delete(noteId);
    replacePendingUpdates(next);
  }

  function schedulePendingRetry() {
    if (
      !navigator.onLine ||
      pendingUpdatesRef.current.size === 0 ||
      pendingRetryTimerRef.current !== null
    ) {
      return;
    }
    pendingRetryTimerRef.current = window.setTimeout(() => {
      pendingRetryTimerRef.current = null;
      void syncPendingUpdates();
    }, 5_000);
  }

  async function syncPendingUpdates() {
    if (
      isSyncingPendingUpdatesRef.current ||
      pendingUpdatesRef.current.size === 0
    ) {
      return;
    }

    isSyncingPendingUpdatesRef.current = true;
    const queuedUpdates = [...pendingUpdatesRef.current.entries()];
    try {
      for (const [noteId, updates] of queuedUpdates) {
        try {
          await patchNote(noteId, updates);
          clearPendingUpdate(noteId, updates);
        } catch (error) {
          console.error(`Failed to sync update for note ${noteId}:`, error);
        }
      }
    } finally {
      isSyncingPendingUpdatesRef.current = false;
      schedulePendingRetry();
    }
  }

  async function createBox(screenX: number, screenY: number) {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true);

    const worldCoords = {
      x: (screenX - panStateRef.current.x) / zoomStateRef.current,
      y: (screenY - panStateRef.current.y) / zoomStateRef.current,
    };
    const body = {
      content: "",
      color: nextColor,
      // Center the note around the screen/world point
      position_x: worldCoords.x - CANVAS_NOTE_WIDTH / 2,
      position_y: worldCoords.y - CANVAS_NOTE_HEIGHT / 2,
      user_id: user?.uid ?? null,
      user_name: user?.displayName || user?.email || null,
    };
    // Queue up a different shade for the note after this one
    setNextColor(pickRandomColor());

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

  async function patchNote(
    noteId: string,
    updates: Partial<NoteData>,
  ): Promise<boolean> {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return true;
  }

  async function updateNoteInDatabase(
    noteId: string,
    updates: Partial<NoteData>,
  ) {
    const queuedUpdate = queuePendingUpdate(noteId, updates);

    try {
      await patchNote(noteId, queuedUpdate);
      clearPendingUpdate(noteId, queuedUpdate);
      setNotes((prev) =>
        prev.map((note) =>
          note.id === noteId ? { ...note, ...queuedUpdate } : note,
        ),
      );
    } catch (error) {
      console.error("Error updating note:", error);
      showToast("Couldn't save your change — it will be synced later", "error");
      schedulePendingRetry();
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

  function releasePointerCapture(
    target: Element | null,
    pointerId: number | null,
  ) {
    if (!target || pointerId === null) return;
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  function stopPanning(flushPending = false) {
    const pending = pendingPanRef.current;
    if (flushPending && pending) {
      const nextPan = {
        x: panStateRef.current.x + pending.x - lastPanPointRef.current.x,
        y: panStateRef.current.y + pending.y - lastPanPointRef.current.y,
      };
      setPan(nextPan.x, nextPan.y);
      panStateRef.current = nextPan;
      lastPanPointRef.current = { ...pending };
    }
    releasePointerCapture(
      panCaptureTargetRef.current,
      activePanPointerIdRef.current,
    );
    isPanningRef.current = false;
    setIsPanning(false);
    activePanPointerIdRef.current = null;
    panCaptureTargetRef.current = null;
    pendingPanRef.current = null;
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
  }

  function cancelDragForPinch() {
    const start = dragStartPositionRef.current;
    if (start) {
      setNotes((previous) =>
        previous.map((note) =>
          note.id === start.noteId
            ? { ...note, position_x: start.x, position_y: start.y }
            : note,
        ),
      );
    }

    releasePointerCapture(
      dragCaptureTargetRef.current,
      activeDragPointerIdRef.current,
    );
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    pendingDragRef.current = null;
    latestDragPositionRef.current = null;
    dragStartPositionRef.current = null;
    dragCaptureTargetRef.current = null;
    activeDragPointerIdRef.current = null;
    isDraggingRef.current = null;
    setIsDragging(null);
  }

  function beginPinchGesture() {
    const container = containerRef.current;
    const pointers = [...activeTouchPointersRef.current.entries()].slice(0, 2);
    if (!container || pointers.length < 2) return;

    stopPanning();
    cancelDragForPinch();
    suppressTouchUntilReleaseRef.current = true;

    const rect = container.getBoundingClientRect();
    const first = {
      x: pointers[0][1].x - rect.left,
      y: pointers[0][1].y - rect.top,
    };
    const second = {
      x: pointers[1][1].x - rect.left,
      y: pointers[1][1].y - rect.top,
    };
    const startDistance = distanceBetween(first, second);
    if (startDistance <= 0) return;

    pinchGestureRef.current = {
      pointerIds: [pointers[0][0], pointers[1][0]],
      startDistance,
      startZoom: zoomStateRef.current,
      startPan: { ...panStateRef.current },
      startCenter: midpointBetween(first, second),
    };

    for (const [pointerId] of pointers) {
      try {
        container.setPointerCapture(pointerId);
      } catch {}
    }
  }

  function handlePointerDownCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;

    activeTouchPointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });
    if (activeTouchPointersRef.current.size === 2) {
      e.preventDefault();
      beginPinchGesture();
    } else if (activeTouchPointersRef.current.size > 2) {
      e.preventDefault();
      suppressTouchUntilReleaseRef.current = true;
    }
  }

  function handlePointerDown(e: React.PointerEvent, noteId: string) {
    const target = e.target as HTMLElement;
    const isDragHandle = target.closest(".note-drag-handle");
    const isInteractiveElement = target.closest("button, textarea, input");
    const touchIsPinching =
      e.pointerType === "touch" &&
      (activeTouchPointersRef.current.size > 1 ||
        suppressTouchUntilReleaseRef.current);

    if (
      touchIsPinching ||
      (!isDragHandle && (isInteractiveElement || e.button !== 0))
    ) {
      return;
    }

    const container = containerRef.current;
    const note = notes.find((item) => item.id === noteId);
    if (!container || !note) return;

    e.preventDefault();
    e.stopPropagation();
    const rect = container.getBoundingClientRect();
    const screenPosition = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPosition = {
      x: (screenPosition.x - panStateRef.current.x) / zoomStateRef.current,
      y: (screenPosition.y - panStateRef.current.y) / zoomStateRef.current,
    };

    dragOffsetRef.current = {
      x: worldPosition.x - note.position_x,
      y: worldPosition.y - note.position_y,
    };
    dragStartPositionRef.current = {
      noteId,
      x: note.position_x,
      y: note.position_y,
    };
    latestDragPositionRef.current = {
      noteId,
      x: note.position_x,
      y: note.position_y,
    };
    isDraggingRef.current = noteId;
    setIsDragging(noteId);
    activeDragPointerIdRef.current = e.pointerId;
    dragCaptureTargetRef.current = container;
    try {
      container.setPointerCapture(e.pointerId);
    } catch {}
  }

  function applyPendingPinch() {
    const pending = pendingPinchRef.current;
    if (pending) {
      setZoom(pending.zoom);
      setPan(pending.pan.x, pending.pan.y);
      zoomStateRef.current = pending.zoom;
      panStateRef.current = { ...pending.pan };
      pendingPinchRef.current = null;
    }
    pinchRafRef.current = null;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (
      e.pointerType === "touch" &&
      activeTouchPointersRef.current.has(e.pointerId)
    ) {
      activeTouchPointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      const pinch = pinchGestureRef.current;
      if (pinch) {
        const firstPointer = activeTouchPointersRef.current.get(
          pinch.pointerIds[0],
        );
        const secondPointer = activeTouchPointersRef.current.get(
          pinch.pointerIds[1],
        );
        const container = containerRef.current;
        if (firstPointer && secondPointer && container) {
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const first = {
            x: firstPointer.x - rect.left,
            y: firstPointer.y - rect.top,
          };
          const second = {
            x: secondPointer.x - rect.left,
            y: secondPointer.y - rect.top,
          };
          pendingPinchRef.current = calculatePinchTransform({
            startDistance: pinch.startDistance,
            currentDistance: distanceBetween(first, second),
            startZoom: pinch.startZoom,
            startPan: pinch.startPan,
            startCenter: pinch.startCenter,
            currentCenter: midpointBetween(first, second),
          });
          if (pinchRafRef.current === null) {
            pinchRafRef.current =
              window.requestAnimationFrame(applyPendingPinch);
          }
        }
        return;
      }

      if (suppressTouchUntilReleaseRef.current) return;
    }

    if (isPanningRef.current && e.pointerId === activePanPointerIdRef.current) {
      pendingPanRef.current = { x: e.clientX, y: e.clientY };
      if (panRafRef.current === null) {
        panRafRef.current = window.requestAnimationFrame(() => {
          const pending = pendingPanRef.current;
          if (pending) {
            const deltaX = pending.x - lastPanPointRef.current.x;
            const deltaY = pending.y - lastPanPointRef.current.y;
            const nextPan = {
              x: panStateRef.current.x + deltaX,
              y: panStateRef.current.y + deltaY,
            };
            setPan(nextPan.x, nextPan.y);
            panStateRef.current = nextPan;
            lastPanPointRef.current = { x: pending.x, y: pending.y };
          }
          panRafRef.current = null;
        });
      }
      return;
    }

    const draggingNoteId = isDraggingRef.current;
    if (
      draggingNoteId &&
      e.pointerId === activeDragPointerIdRef.current &&
      containerRef.current
    ) {
      const rect = containerRef.current.getBoundingClientRect();
      const screenPosition = {
        x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
        y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
      };
      const worldPosition = {
        x: (screenPosition.x - panStateRef.current.x) / zoomStateRef.current,
        y: (screenPosition.y - panStateRef.current.y) / zoomStateRef.current,
      };
      const nextPosition = {
        noteId: draggingNoteId,
        x: worldPosition.x - dragOffsetRef.current.x,
        y: worldPosition.y - dragOffsetRef.current.y,
      };
      pendingDragRef.current = nextPosition;
      latestDragPositionRef.current = nextPosition;
      if (dragRafRef.current === null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          const pending = pendingDragRef.current;
          if (pending) {
            setNotes((previous) =>
              previous.map((note) =>
                note.id === pending.noteId
                  ? {
                      ...note,
                      position_x: pending.x,
                      position_y: pending.y,
                    }
                  : note,
              ),
            );
          }
          dragRafRef.current = null;
        });
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const endingPinch = pinchGestureRef.current;
    const wasSuppressedTouch =
      e.pointerType === "touch" &&
      (pinchGestureRef.current !== null ||
        suppressTouchUntilReleaseRef.current);

    if (e.pointerType === "touch") {
      activeTouchPointersRef.current.delete(e.pointerId);
    }

    if (wasSuppressedTouch) {
      if (pinchRafRef.current !== null) {
        cancelAnimationFrame(pinchRafRef.current);
        applyPendingPinch();
      }
      releasePointerCapture(containerRef.current, e.pointerId);
      if (
        activeTouchPointersRef.current.size >= 2 &&
        endingPinch?.pointerIds.includes(e.pointerId)
      ) {
        beginPinchGesture();
      } else if (activeTouchPointersRef.current.size < 2) {
        pinchGestureRef.current = null;
      }
      if (activeTouchPointersRef.current.size === 0) {
        suppressTouchUntilReleaseRef.current = false;
        pendingPinchRef.current = null;
      }
      return;
    }

    const draggingNoteId = isDraggingRef.current;
    if (draggingNoteId && e.pointerId === activeDragPointerIdRef.current) {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const start = dragStartPositionRef.current;
      const latest = latestDragPositionRef.current;
      const wasCancelled = e.type === "pointercancel";

      if (wasCancelled && start) {
        setNotes((previous) =>
          previous.map((note) =>
            note.id === start.noteId
              ? { ...note, position_x: start.x, position_y: start.y }
              : note,
          ),
        );
      } else if (
        start &&
        latest &&
        (latest.x !== start.x || latest.y !== start.y)
      ) {
        const updates = {
          position_x: latest.x,
          position_y: latest.y,
        };
        setNotes((previous) =>
          previous.map((note) =>
            note.id === draggingNoteId ? { ...note, ...updates } : note,
          ),
        );
        void updateNoteInDatabase(draggingNoteId, updates);
      }

      releasePointerCapture(
        dragCaptureTargetRef.current,
        activeDragPointerIdRef.current,
      );
      pendingDragRef.current = null;
      latestDragPositionRef.current = null;
      dragStartPositionRef.current = null;
      dragCaptureTargetRef.current = null;
      activeDragPointerIdRef.current = null;
      isDraggingRef.current = null;
      setIsDragging(null);
    }

    if (e.pointerId === activePanPointerIdRef.current) {
      stopPanning(true);
    }
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
    updateNoteInDatabase(noteId, {
      color: newColor,
      edited_at: new Date().toISOString(),
    });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleCustomZoom(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.85);
  }

  function handleCustomZoom(
    clientX: number,
    clientY: number,
    scaleFactor: number,
  ) {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      const currentZoom = zoomStateRef.current;
      const currentPan = panStateRef.current;
      const newZoom = Math.max(
        MIN_CANVAS_ZOOM,
        Math.min(MAX_CANVAS_ZOOM, currentZoom * scaleFactor),
      );

      const newPanX =
        mouseX - (mouseX - currentPan.x) * (newZoom / currentZoom);
      const newPanY =
        mouseY - (mouseY - currentPan.y) * (newZoom / currentZoom);

      setZoom(newZoom);
      setPan(newPanX, newPanY);
      zoomStateRef.current = newZoom;
      panStateRef.current = { x: newPanX, y: newPanY };
    }
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    // Clicking empty board ends any active note edit (like pressing Esc)
    if (editingNote) {
      setEditingNote(null);
    }
    const isMouseOrPen = e.pointerType === "mouse" || e.pointerType === "pen";
    const shouldPanMouse = isMouseOrPen && (e.button === 0 || e.button === 1);
    const shouldPanTouch =
      e.pointerType === "touch" &&
      activeTouchPointersRef.current.size === 1 &&
      !suppressTouchUntilReleaseRef.current;

    if (shouldPanMouse || shouldPanTouch) {
      e.preventDefault();
      e.stopPropagation();
      const captureTarget = containerRef.current;
      if (!captureTarget) return;
      try {
        captureTarget.setPointerCapture(e.pointerId);
      } catch {}
      isPanningRef.current = true;
      setIsPanning(true);
      activePanPointerIdRef.current = e.pointerId;
      panCaptureTargetRef.current = captureTarget;
      const rect = captureTarget.getBoundingClientRect();
      const clampedX = Math.max(
        rect.left + 1,
        Math.min(e.clientX, rect.right - 1),
      );
      const clampedY = Math.max(
        rect.top + 1,
        Math.min(e.clientY, rect.bottom - 1),
      );
      lastPanPointRef.current = { x: clampedX, y: clampedY };
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
        isPanningRef.current = false;
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
        const normalized = normalizeNotesCollection(
          Object.fromEntries(
            loaded
              .filter((note): note is Record<string, unknown> =>
                Boolean(note && typeof note === "object"),
              )
              .map((note) => [String(note.id ?? ""), note]),
          ),
        )
          .filter((note) => !pendingDeleteIdsRef.current.has(note.id))
          .map((note) => ({
            ...note,
            ...pendingUpdatesRef.current.get(note.id),
          }));
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
          normalizeNotesCollection(snapshot.val())
            .filter((note) => !pendingDeleteIdsRef.current.has(note.id))
            .map((note) => ({
              ...note,
              ...pendingUpdatesRef.current.get(note.id),
            })),
        );
        void syncPendingUpdates();
      },
      (error) => {
        console.error("Realtime subscription error:", error);
        setIsConnected(false);
      },
    );

    return () => {
      cancelled = true;
      if (pendingRetryTimerRef.current !== null) {
        window.clearTimeout(pendingRetryTimerRef.current);
        pendingRetryTimerRef.current = null;
      }
      unsubscribe();
    };
    // This subscription deliberately stays mounted; its queue helpers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCanvasClick}
      >
        <NotesCanvas
          notes={notes}
          isDragging={isDragging}
          editingNote={editingNote}
          onPointerDown={handlePointerDown}
          onNoteEdit={handleNoteEdit}
          onNoteDelete={handleNoteDelete}
          onNoteChange={handleNoteChange}
          onColorChange={handleColorChange}
          onEditSave={() => setEditingNote(null)}
          onCanvasPointerDown={handleCanvasPointerDown}
          currentUserId={user?.uid || undefined}
          onToggleStar={toggleStar}
        />
      </div>

      {/* Floating controls - Top Left and Right */}
      <div
        className="absolute z-50 w-full px-3 sm:px-4 flex flex-row justify-between prevent-zoom"
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
          className="group min-w-11 min-h-11 flex items-center justify-center gap-2.5 px-3 sm:px-5 py-2.5 bg-white/95 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg hover:shadow-xl hover:bg-white transition-all duration-300 font-medium text-gray-700 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <div
            className="p-1 rounded-lg shadow-sm transition-colors duration-300 group-hover:scale-102"
            style={{ backgroundColor: NOTE_COLORS[nextColor].bg }}
          >
            <PlusIcon
              className={`w-4 h-4 text-gray-800/70 ${isCreating ? "animate-pulse" : ""}`}
            />
          </div>
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
        className="md:pointer-fine:hidden absolute left-1/2 -translate-x-1/2 z-50 prevent-zoom"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <ZoomControls notes={notes} />
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
    <ZoomProvider
      containerWidth={dimensions.width}
      containerHeight={dimensions.height}
    >
      <HomeContent />
    </ZoomProvider>
  );
}
