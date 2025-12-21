"use client";

import { useRef, useCallback, useState, useMemo } from "react";
import { useZoom } from "@/contexts/ZoomContext";
import Note, { NoteProps } from "@/components/Note";
import { X } from "lucide-react";

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

interface NotesCanvasProps {
  notes: NoteData[];
  isDragging: string | null;
  editingNote: string | null;
  onPointerDown: (e: React.PointerEvent, noteId: string) => void;
  onNoteEdit: (noteId: string) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteChange: (noteId: string, content: string) => void;
  onColorChange: (noteId: string, newColor: string) => void;
  onEditSave: () => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onCanvasPointerDown?: (e: React.PointerEvent) => void;
  currentUserId?: string;
  onToggleStar: (noteId: string) => void;
}

const NotesCanvas: React.FC<NotesCanvasProps> = ({
  notes,
  isDragging,
  editingNote,
  onPointerDown,
  onNoteEdit,
  onNoteDelete,
  onNoteChange,
  onColorChange,
  onEditSave,
  onPointerMove,
  onPointerUp,
  onCanvasPointerDown,
  currentUserId,
  onToggleStar,
}) => {
  const { zoom, panX, panY, isAnimating } = useZoom();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onCanvasPointerDown?.(e);
    },
    [onCanvasPointerDown]
  );

  const handleNotePointerDown = useCallback(
    (e: React.PointerEvent, noteId: string) => {
      const target = e.target as HTMLElement;
      const isInteractive = Boolean(
        target.closest("button,textarea,input,select,a,[role='button']")
      );
      // Only start drag when not interacting with controls
      if (isInteractive) {
        e.stopPropagation();
        return;
      }
      // Prevent mouse compatibility events firing when dragging
      e.preventDefault();
      e.stopPropagation();
      onPointerDown(e, noteId);
    },
    [onPointerDown]
  );

  const GRID_SIZE = 20;

  const backgroundStyle = useMemo(() => {
    // Clean white paper background
    return {
      background: `
        radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.9) 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 100% 100%, rgba(255, 255, 255, 0.5) 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 0% 100%, rgba(252, 252, 252, 0.5) 0%, transparent 50%),
        linear-gradient(180deg, #ffffff 0%, #fefefe 30%, #fcfcfc 60%, #fafafa 100%)
      `,
    };
  }, []);

  const hideControls = () => {
    setShowControls(false);
  };

  // Connection lines
  const renderConnectionLines = useCallback(() => {
    if (zoom < 0.5 || notes.length < 2) return null;

    const connections: React.ReactElement[] = [];
    const NOTE_THRESHOLD = 150;

    notes.forEach((note1, i) => {
      notes.slice(i + 1).forEach((note2) => {
        const distance = Math.sqrt(
          Math.pow(note1.position_x - note2.position_x, 2) +
          Math.pow(note1.position_y - note2.position_y, 2)
        );

        if (distance < NOTE_THRESHOLD) {
          const opacity = Math.max(0.1, 1 - distance / NOTE_THRESHOLD) * 0.3;
          connections.push(
            <line
              key={`${note1.id}-${note2.id}`}
              x1={note1.position_x + 128}
              y1={note1.position_y + 96}
              x2={note2.position_x + 128}
              y2={note2.position_y + 96}
              stroke="rgba(99, 102, 241, 0.4)"
              strokeWidth={Math.max(0.5, 1 / zoom)}
              opacity={opacity}
              strokeDasharray={`${6 / zoom} ${6 / zoom}`}
            />
          );
        }
      });
    });

    return connections.length > 0 ? (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{
          width: `${100 / zoom}%`,
          height: `${100 / zoom}%`,
          willChange: "transform",
        }}
      >
        {connections}
      </svg>
    ) : null;
  }, [notes, zoom]);

  // Note rendering - no transitions on transform for smooth panning
  const renderNote = useCallback(
    (note: NoteData, index: number) => {
      const isDraggingThis = isDragging === note.id;

      return (
        <div
          key={`${note.id}-${index}`}
          className={`note-container absolute ${isDraggingThis ? "z-50" : "z-10"}`}
          style={{
            transform: `translate3d(${note.position_x}px, ${note.position_y}px, 0)`,
            transformOrigin: "top left",
            opacity: isDraggingThis ? 0.95 : 1,
            cursor: isDraggingThis ? "grabbing" : "grab",
            pointerEvents: "auto",
          }}
          onPointerDown={(e) => handleNotePointerDown(e, note.id)}
          onClick={(e) => e.stopPropagation()}
        >
          <Note
            id={note.id}
            title="Note"
            content={note.content}
            color={(note.color as NoteProps["color"]) || "blue"}
            isEditing={editingNote === note.id}
            onEdit={onNoteEdit}
            onDelete={onNoteDelete}
            onContentChange={onNoteChange}
            onEditSave={onEditSave}
            onColorChange={onColorChange}
            createdAt={note.created_at}
            createdBy={note.user_name || note.user_id || "Anonymous"}
            editedAt={note.edited_at}
            isStarred={Boolean(
              currentUserId && note.stars && note.stars[currentUserId]
            )}
            starCount={Object.keys(note.stars || {}).length}
            onToggleStar={() => onToggleStar(note.id)}
          />
        </div>
      );
    },
    [
      isDragging,
      editingNote,
      handleNotePointerDown,
      onNoteEdit,
      onNoteDelete,
      onNoteChange,
      onEditSave,
      onColorChange,
      currentUserId,
      onToggleStar,
    ]
  );

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden cursor-grab"
      style={{
        ...backgroundStyle,
        touchAction: "none",
        willChange: "transform",
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`
          absolute inset-0 origin-top-left
          ${isAnimating ? "transition-transform duration-500 ease-out" : ""}
        `}
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
          width: `${100 / zoom}%`,
          height: `${100 / zoom}%`,
          willChange: "transform",
        }}
      >
        {renderConnectionLines()}
        {notes.map(renderNote)}
      </div>

      <div className="absolute bottom-4 right-4 flex gap-2 pointer-events-none">
        {showControls && (
          <div className="hidden md:block pointer-events-none bg-white/85 backdrop-blur-xl border border-white/60 rounded-2xl px-5 py-4 text-sm text-gray-600 shadow-lg max-w-xs">
            <div className="font-semibold flex justify-between mb-3 text-gray-800">
              Controls
              <button
                className="pointer-events-auto p-1 -m-1 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={hideControls}
                aria-label="Hide controls"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                Drag notes to move them
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                Click & drag empty space to pan
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                Scroll/pinch to zoom
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesCanvas;
