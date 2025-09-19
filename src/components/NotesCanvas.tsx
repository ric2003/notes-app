"use client";

import { useRef, useCallback, useState, useMemo } from "react";
import { useZoom } from "@/contexts/ZoomContext";
import Note, { NoteProps } from "@/components/Note";

interface NoteData {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  created_at?: string;
  user_id?: string;
  edited_at?: string;
  stars?: Record<string, boolean>;
}

interface NotesCanvasProps {
  notes: NoteData[];
  isDragging: string | null;
  editingNote: string | null;
  onMouseDown: (e: React.MouseEvent, noteId: string) => void;
  onNoteEdit: (noteId: string) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteChange: (noteId: string, content: string) => void;
  onColorChange: (noteId: string, newColor: string) => void;
  onEditSave: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onCanvasMouseDown?: (e: React.MouseEvent) => void;
  currentUserId?: string;
  onToggleStar: (noteId: string) => void;
}

const NotesCanvas: React.FC<NotesCanvasProps> = ({
  notes,
  isDragging,
  editingNote,
  onMouseDown,
  onNoteEdit,
  onNoteDelete,
  onNoteChange,
  onColorChange,
  onEditSave,
  onMouseMove,
  onMouseUp,
  onCanvasMouseDown,
  currentUserId,
  onToggleStar,
}) => {
  const { zoom, panX, panY, isAnimating } = useZoom();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onCanvasMouseDown?.(e);
    },
    [onCanvasMouseDown]
  );

  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation();
      onMouseDown(e, noteId);
    },
    [onMouseDown]
  );

  const GRID_SIZE = 20;

  const backgroundStyle = useMemo(() => {
    const baseBackground = `
      radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.1) 0%, transparent 50%),
      linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)
    `;

    const effectiveGridSize = GRID_SIZE * zoom;
    const opacity = Math.min(0.3, Math.max(0.05, zoom * 0.2));

    if (effectiveGridSize < 5) {
      return {
        background: baseBackground,
      };
    }

    return {
      background: `
        linear-gradient(rgba(99, 102, 241, ${opacity}) 2px, transparent 2px),
        linear-gradient(90deg, rgba(99, 102, 241, ${opacity}) 2px, transparent 2px),
        ${baseBackground}
      `,
      backgroundSize: `${effectiveGridSize}px ${effectiveGridSize}px`,
      backgroundPosition: `${panX % effectiveGridSize}px ${panY % effectiveGridSize}px`,
    };
  }, [zoom, panX, panY]);

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
        }}
      >
        {connections}
      </svg>
    ) : null;
  }, [notes, zoom]);

  // Enhanced note rendering
  const renderNote = useCallback(
    (note: NoteData, index: number) => {
      const isDraggingThis = isDragging === note.id;
      const isHovered = hoveredNote === note.id;

      return (
        <div
          key={`${note.id}-${index}`}
          className={`
          note-container absolute transition-all duration-300 ease-out
          ${isDraggingThis ? "z-50" : "z-10"}
        `}
          style={{
            transform: `
            translate3d(${note.position_x}px, ${note.position_y}px, 0)
            ${isDraggingThis ? "scale(1.05) rotate(1deg)" : isHovered ? "scale(1.02)" : "scale(1)"}
          `,
            opacity: isDraggingThis ? 0.95 : 1,
            filter: `
            drop-shadow(${isDraggingThis ? "0 25px 50px" : isHovered ? "0 10px 30px" : "0 4px 15px"} 
            rgba(0, 0, 0, ${isDraggingThis ? 0.3 : isHovered ? 0.15 : 0.1}))
          `,
            cursor: isDraggingThis ? "grabbing" : "grab",
            pointerEvents: "auto",
          }}
          onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
          onMouseEnter={() => setHoveredNote(note.id)}
          onMouseLeave={() => setHoveredNote(null)}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {isDraggingThis && (
            <div
              className="absolute inset-0 rounded-xl pointer-events-none animate-pulse"
              style={{
                background:
                  "radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)",
                transform: "scale(1.2)",
                filter: "blur(10px)",
              }}
            />
          )}

          {isHovered && !isDraggingThis && (
            <div
              className="absolute inset-0 rounded-xl border-2 border-blue-300 pointer-events-none transition-all duration-200"
              style={{
                transform: "translate(-1px, -1px)",
                opacity: 0.6,
              }}
            />
          )}

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
            className={`
            transition-all duration-200
            ${isDraggingThis ? "shadow-2xl" : ""}
          `}
            createdAt={note.created_at}
            createdBy={note.user_id || "Anonymous"}
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
      hoveredNote,
      editingNote,
      handleNoteMouseDown,
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
      }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
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
        }}
      >
        {renderConnectionLines()}
        {notes.map(renderNote)}
      </div>

      <div className="absolute bottom-4 right-4 flex gap-2 pointer-events-none">
        <div className="hidden xl:block bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 shadow-lg max-w-xs">
          <div className="font-semibold mb-2 text-gray-800">Controls:</div>
          <div className="space-y-1">
            <div>• Drag notes to move them</div>
            <div>• Click & drag empty space to pan</div>
            <div>• Scroll/pinch to zoom</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesCanvas;
