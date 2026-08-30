"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useZoom } from "@/contexts/ZoomContext";
import {
  calculateNoteResize,
  calculatePinchTransform,
  clampNoteSize,
  distanceBetween,
  MAX_CANVAS_ZOOM,
  midpointBetween,
  MIN_CANVAS_ZOOM,
  type CanvasPoint,
  type NoteSize,
} from "@/lib/canvas-geometry";
import type { NoteData } from "@/lib/notes";

type UseCanvasGesturesOptions = {
  notes: NoteData[];
  setNotes: Dispatch<SetStateAction<NoteData[]>>;
  editingNote: string | null;
  setEditingNote: Dispatch<SetStateAction<string | null>>;
  onNoteGeometryChange: (
    noteId: string,
    updates: Partial<
      Pick<NoteData, "position_x" | "position_y" | "width" | "height">
    >,
  ) => void;
};

type PinchGesture = {
  pointerIds: [number, number];
  startDistance: number;
  startZoom: number;
  startPan: CanvasPoint;
  startCenter: CanvasPoint;
};

export function useCanvasGestures({
  notes,
  setNotes,
  editingNote,
  setEditingNote,
  onNoteGeometryChange,
}: UseCanvasGesturesOptions) {
  const containerRef: RefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement>(null);
  const { zoom, panX, panY, setPan, setZoom } = useZoom();
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef<CanvasPoint>({ x: 0, y: 0 });
  const zoomStateRef = useRef(1);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef<string | null>(null);
  const isResizingRef = useRef<string | null>(null);
  const lastPanPointRef = useRef<CanvasPoint>({ x: 0, y: 0 });
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
  const resizeStartRef = useRef<{
    noteId: string;
    size: NoteSize;
    pointer: CanvasPoint;
  } | null>(null);
  const latestResizeRef = useRef<
    (NoteSize & { noteId: string }) | null
  >(null);
  const activeTouchPointersRef = useRef<Map<number, CanvasPoint>>(new Map());
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const suppressTouchUntilReleaseRef = useRef(false);
  const activePanPointerIdRef = useRef<number | null>(null);
  const activeDragPointerIdRef = useRef<number | null>(null);
  const activeResizePointerIdRef = useRef<number | null>(null);
  const panCaptureTargetRef = useRef<Element | null>(null);
  const dragCaptureTargetRef = useRef<Element | null>(null);
  const resizeCaptureTargetRef = useRef<Element | null>(null);
  const pendingPanRef = useRef<CanvasPoint | null>(null);
  const pendingDragRef = useRef<{
    noteId: string;
    x: number;
    y: number;
  } | null>(null);
  const pendingResizeRef = useRef<
    (NoteSize & { noteId: string }) | null
  >(null);
  const pendingPinchRef = useRef<{
    zoom: number;
    pan: CanvasPoint;
  } | null>(null);
  const panRafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const pinchRafRef = useRef<number | null>(null);

  useEffect(() => {
    panStateRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  useEffect(() => {
    zoomStateRef.current = zoom;
  }, [zoom]);

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

  function cancelResize(restoreStart: boolean) {
    const start = resizeStartRef.current;
    if (restoreStart && start) {
      setNotes((previous) =>
        previous.map((note) =>
          note.id === start.noteId ? { ...note, ...start.size } : note,
        ),
      );
    }

    releasePointerCapture(
      resizeCaptureTargetRef.current,
      activeResizePointerIdRef.current,
    );
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    pendingResizeRef.current = null;
    latestResizeRef.current = null;
    resizeStartRef.current = null;
    resizeCaptureTargetRef.current = null;
    activeResizePointerIdRef.current = null;
    isResizingRef.current = null;
    setIsResizing(null);
  }

  function beginPinchGesture() {
    const container = containerRef.current;
    const pointers = [...activeTouchPointersRef.current.entries()].slice(0, 2);
    if (!container || pointers.length < 2) return;

    stopPanning();
    cancelDragForPinch();
    cancelResize(true);
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

  function handlePointerDownCapture(event: ReactPointerEvent) {
    if (event.pointerType !== "touch") return;

    activeTouchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activeTouchPointersRef.current.size === 2) {
      event.preventDefault();
      beginPinchGesture();
    } else if (activeTouchPointersRef.current.size > 2) {
      event.preventDefault();
      suppressTouchUntilReleaseRef.current = true;
    }
  }

  function handleNotePointerDown(event: ReactPointerEvent, noteId: string) {
    const target = event.target as HTMLElement;
    const isDragHandle = target.closest(".note-drag-handle");
    const isInteractiveElement = target.closest("button, textarea, input");
    const touchIsPinching =
      event.pointerType === "touch" &&
      (activeTouchPointersRef.current.size > 1 ||
        suppressTouchUntilReleaseRef.current);

    if (
      touchIsPinching ||
      (!isDragHandle && (isInteractiveElement || event.button !== 0))
    ) {
      return;
    }

    const container = containerRef.current;
    const note = notes.find((item) => item.id === noteId);
    if (!container || !note) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = container.getBoundingClientRect();
    const screenPosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const worldPosition = screenToWorld(screenPosition.x, screenPosition.y);

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
    activeDragPointerIdRef.current = event.pointerId;
    dragCaptureTargetRef.current = container;
    try {
      container.setPointerCapture(event.pointerId);
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

  function handlePointerMove(event: ReactPointerEvent) {
    if (
      event.pointerType === "touch" &&
      activeTouchPointersRef.current.has(event.pointerId)
    ) {
      activeTouchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
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
          event.preventDefault();
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

    if (
      isPanningRef.current &&
      event.pointerId === activePanPointerIdRef.current
    ) {
      pendingPanRef.current = { x: event.clientX, y: event.clientY };
      if (panRafRef.current === null) {
        panRafRef.current = window.requestAnimationFrame(() => {
          const pending = pendingPanRef.current;
          if (pending) {
            const nextPan = {
              x: panStateRef.current.x + pending.x - lastPanPointRef.current.x,
              y: panStateRef.current.y + pending.y - lastPanPointRef.current.y,
            };
            setPan(nextPan.x, nextPan.y);
            panStateRef.current = nextPan;
            lastPanPointRef.current = { ...pending };
          }
          panRafRef.current = null;
        });
      }
      return;
    }

    const resizingNoteId = isResizingRef.current;
    const resizeStart = resizeStartRef.current;
    if (
      resizingNoteId &&
      resizeStart &&
      event.pointerId === activeResizePointerIdRef.current &&
      containerRef.current
    ) {
      const rect = containerRef.current.getBoundingClientRect();
      const pointer = screenToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      const nextSize = calculateNoteResize({
        startSize: resizeStart.size,
        startPointer: resizeStart.pointer,
        currentPointer: pointer,
      });
      const pending = { noteId: resizingNoteId, ...nextSize };
      pendingResizeRef.current = pending;
      latestResizeRef.current = pending;
      if (resizeRafRef.current === null) {
        resizeRafRef.current = window.requestAnimationFrame(() => {
          const next = pendingResizeRef.current;
          if (next) {
            setNotes((previous) =>
              previous.map((note) =>
                note.id === next.noteId
                  ? { ...note, width: next.width, height: next.height }
                  : note,
              ),
            );
          }
          resizeRafRef.current = null;
        });
      }
      return;
    }

    const draggingNoteId = isDraggingRef.current;
    if (
      draggingNoteId &&
      event.pointerId === activeDragPointerIdRef.current &&
      containerRef.current
    ) {
      const rect = containerRef.current.getBoundingClientRect();
      const screenPosition = {
        x: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
        y: Math.max(0, Math.min(event.clientY - rect.top, rect.height)),
      };
      const worldPosition = screenToWorld(screenPosition.x, screenPosition.y);
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

  function handleNoteResizePointerDown(
    event: ReactPointerEvent,
    noteId: string,
  ) {
    const touchIsPinching =
      event.pointerType === "touch" &&
      (activeTouchPointersRef.current.size > 1 ||
        suppressTouchUntilReleaseRef.current);
    const isPrimaryButton = event.pointerType === "touch" || event.button === 0;
    if (touchIsPinching || !isPrimaryButton) return;

    const container = containerRef.current;
    const note = notes.find((item) => item.id === noteId);
    if (!container || !note) return;

    event.preventDefault();
    event.stopPropagation();
    stopPanning();
    cancelDragForPinch();

    const rect = container.getBoundingClientRect();
    const pointer = screenToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    const size = clampNoteSize(note.width, note.height);

    resizeStartRef.current = { noteId, size, pointer };
    latestResizeRef.current = { noteId, ...size };
    activeResizePointerIdRef.current = event.pointerId;
    resizeCaptureTargetRef.current = container;
    isResizingRef.current = noteId;
    setIsResizing(noteId);
    try {
      container.setPointerCapture(event.pointerId);
    } catch {}
  }

  function handleNoteResizeKeyDown(
    event: ReactKeyboardEvent,
    noteId: string,
  ) {
    const note = notes.find((item) => item.id === noteId);
    if (!note) return;

    const step = event.shiftKey ? 64 : 16;
    let width = note.width;
    let height = note.height;
    if (event.key === "ArrowLeft") width -= step;
    else if (event.key === "ArrowRight") width += step;
    else if (event.key === "ArrowUp") height -= step;
    else if (event.key === "ArrowDown") height += step;
    else return;

    event.preventDefault();
    event.stopPropagation();
    const nextSize = clampNoteSize(width, height);
    if (nextSize.width === note.width && nextSize.height === note.height) return;

    setNotes((previous) =>
      previous.map((item) =>
        item.id === noteId ? { ...item, ...nextSize } : item,
      ),
    );
    onNoteGeometryChange(noteId, nextSize);
  }

  function handlePointerEnd(event: ReactPointerEvent) {
    const endingPinch = pinchGestureRef.current;
    const wasSuppressedTouch =
      event.pointerType === "touch" &&
      (pinchGestureRef.current !== null ||
        suppressTouchUntilReleaseRef.current);

    if (event.pointerType === "touch") {
      activeTouchPointersRef.current.delete(event.pointerId);
    }

    if (wasSuppressedTouch) {
      if (pinchRafRef.current !== null) {
        cancelAnimationFrame(pinchRafRef.current);
        applyPendingPinch();
      }
      releasePointerCapture(containerRef.current, event.pointerId);
      if (
        activeTouchPointersRef.current.size >= 2 &&
        endingPinch?.pointerIds.includes(event.pointerId)
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

    const resizingNoteId = isResizingRef.current;
    if (
      resizingNoteId &&
      event.pointerId === activeResizePointerIdRef.current
    ) {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      const start = resizeStartRef.current;
      const latest = latestResizeRef.current;
      const wasCancelled = event.type === "pointercancel";

      if (wasCancelled && start) {
        setNotes((previous) =>
          previous.map((note) =>
            note.id === start.noteId ? { ...note, ...start.size } : note,
          ),
        );
      } else if (
        start &&
        latest &&
        (latest.width !== start.size.width ||
          latest.height !== start.size.height)
      ) {
        const updates = { width: latest.width, height: latest.height };
        setNotes((previous) =>
          previous.map((note) =>
            note.id === resizingNoteId ? { ...note, ...updates } : note,
          ),
        );
        onNoteGeometryChange(resizingNoteId, updates);
      }
      cancelResize(false);
    }

    const draggingNoteId = isDraggingRef.current;
    if (draggingNoteId && event.pointerId === activeDragPointerIdRef.current) {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const start = dragStartPositionRef.current;
      const latest = latestDragPositionRef.current;
      const wasCancelled = event.type === "pointercancel";

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
        onNoteGeometryChange(draggingNoteId, updates);
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

    if (event.pointerId === activePanPointerIdRef.current) {
      stopPanning(true);
    }
  }

  function handleCanvasPointerDown(event: ReactPointerEvent) {
    if (editingNote) setEditingNote(null);

    const isMouseOrPen =
      event.pointerType === "mouse" || event.pointerType === "pen";
    const shouldPanMouse =
      isMouseOrPen && (event.button === 0 || event.button === 1);
    const shouldPanTouch =
      event.pointerType === "touch" &&
      activeTouchPointersRef.current.size === 1 &&
      !suppressTouchUntilReleaseRef.current;

    if (!shouldPanMouse && !shouldPanTouch) return;

    event.preventDefault();
    event.stopPropagation();
    const captureTarget = containerRef.current;
    if (!captureTarget) return;
    try {
      captureTarget.setPointerCapture(event.pointerId);
    } catch {}
    isPanningRef.current = true;
    setIsPanning(true);
    activePanPointerIdRef.current = event.pointerId;
    panCaptureTargetRef.current = captureTarget;
    const rect = captureTarget.getBoundingClientRect();
    lastPanPointRef.current = {
      x: Math.max(rect.left + 1, Math.min(event.clientX, rect.right - 1)),
      y: Math.max(rect.top + 1, Math.min(event.clientY, rect.bottom - 1)),
    };
  }

  function handleWheel(event: ReactWheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 0.85);
  }

  function zoomAt(clientX: number, clientY: number, scaleFactor: number) {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    const currentZoom = zoomStateRef.current;
    const currentPan = panStateRef.current;
    const nextZoom = Math.max(
      MIN_CANVAS_ZOOM,
      Math.min(MAX_CANVAS_ZOOM, currentZoom * scaleFactor),
    );
    const nextPan = {
      x: point.x - (point.x - currentPan.x) * (nextZoom / currentZoom),
      y: point.y - (point.y - currentPan.y) * (nextZoom / currentZoom),
    };

    setZoom(nextZoom);
    setPan(nextPan.x, nextPan.y);
    zoomStateRef.current = nextZoom;
    panStateRef.current = nextPan;
  }

  function screenToWorld(screenX: number, screenY: number): CanvasPoint {
    return {
      x: (screenX - panStateRef.current.x) / zoomStateRef.current,
      y: (screenY - panStateRef.current.y) / zoomStateRef.current,
    };
  }

  const mergeWithActiveGeometry = useCallback((incoming: NoteData[]) => {
    const drag = latestDragPositionRef.current;
    const resize = latestResizeRef.current;
    if (!drag && !resize) return incoming;

    return incoming.map((note) => {
      let merged = note;
      if (drag?.noteId === note.id) {
        merged = { ...merged, position_x: drag.x, position_y: drag.y };
      }
      if (resize?.noteId === note.id) {
        merged = {
          ...merged,
          width: resize.width,
          height: resize.height,
        };
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (event.code === "Space" && !event.repeat && !isTyping) {
        event.preventDefault();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "+" || event.key === "-" || event.key === "0")
      ) {
        event.preventDefault();
      }
    };

    const handleDocumentWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("wheel", handleDocumentWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("wheel", handleDocumentWheel);
      for (const frame of [
        panRafRef.current,
        dragRafRef.current,
        resizeRafRef.current,
        pinchRafRef.current,
      ]) {
        if (frame !== null) cancelAnimationFrame(frame);
      }
    };
  }, []);

  return {
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
  };
}
