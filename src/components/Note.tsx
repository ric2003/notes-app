import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  PencilIcon,
  TrashIcon,
  Paintbrush,
  Pen,
  Star,
} from "lucide-react";
import {
  NOTE_COLORS,
  NOTE_COLOR_NAMES,
  type NoteColorName,
} from "@/lib/noteColors";

export interface NoteProps {
  id: string;
  content: string;
  width: number;
  height: number;
  isResizing?: boolean;
  onResizePointerDown?: (e: React.PointerEvent, id: string) => void;
  onResizeKeyDown?: (e: React.KeyboardEvent, id: string) => void;
  color?: "yellow" | "blue" | "green" | "pink" | "purple" | "orange";
  isEditing?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onContentChange?: (id: string, content: string) => void;
  onEditSave?: (id: string) => void;
  onColorChange?: (id: string, color: string) => void;
  className?: string;
  createdAt?: string;
  createdBy?: string;
  createdByPhoto?: string;
  editedAt?: string;
  isStarred?: boolean;
  starCount?: number;
  onToggleStar?: (id: string) => void;
}

const Note: React.FC<NoteProps> = ({
  id,
  content,
  width,
  height,
  isResizing = false,
  onResizePointerDown,
  onResizeKeyDown,
  color = "blue",
  isEditing = false,
  onEdit,
  onDelete,
  onContentChange,
  onEditSave,
  onColorChange,
  className = "",
  createdAt,
  createdBy = "Anonymous",
  createdByPhoto,
  editedAt,
  isStarred = false,
  starCount = 0,
  onToggleStar,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [localContent, setLocalContent] = useState(content);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks unsaved keystrokes so we can flush them when the tab hides/closes
  const isDirtyRef = useRef(false);
  const localContentRef = useRef(localContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMacPlatform =
    typeof window !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  // Move cursor to end when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Clear timeout when editing state changes
  useEffect(() => {
    if (isEditing && debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
  }, [isEditing]);

  localContentRef.current = localContent;

  // Flush unsaved edits when the tab is hidden or closed — the debounce
  // window would otherwise swallow the last second of typing.
  useEffect(() => {
    const flush = () => {
      if (!isDirtyRef.current) return;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      onContentChange?.(id, localContentRef.current);
      isDirtyRef.current = false;
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [id, onContentChange]);

  // Flush unsaved edits when editing ends for any reason (Esc, clicking
  // the board, opening another note) — not just on blur.
  useEffect(() => {
    if (!isEditing && isDirtyRef.current) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      onContentChange?.(id, localContentRef.current);
      isDirtyRef.current = false;
    }
  }, [isEditing, id, onContentChange]);

  const debouncedContentChange = useCallback(
    (newContent: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        debounceTimeoutRef.current = null;
        isDirtyRef.current = false;
        onContentChange?.(id, newContent);
      }, 1000);
    },
    [id, onContentChange],
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return "now";
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return "Now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const colorStyles = NOTE_COLORS;

  const currentStyle =
    colorStyles[color as NoteColorName] ?? colorStyles.yellow;

  const cycleToNextColor = () => {
    const currentIndex = NOTE_COLOR_NAMES.indexOf(
      (color || "blue") as NoteColorName,
    );
    const nextIndex = (currentIndex + 1) % NOTE_COLOR_NAMES.length;
    onColorChange?.(id, NOTE_COLOR_NAMES[nextIndex]);
  };

  // Deterministic tilt per note, so the board looks hand-decorated
  // rather than machine-aligned. Same id always gets the same angle.
  const tiltDeg = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < id.length; i++)
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return ((hash % 9) - 4) * 0.5; // -2deg .. +2deg
  }, [id]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) {
      handleSaveEdit();
    } else {
      onEdit?.(id);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    isDirtyRef.current = true;
    // Only debounce if we're not in editing mode to avoid blocking
    if (!isEditing) {
      debouncedContentChange(newContent);
    }
  };

  const handleSaveEdit = () => {
    // Clear any pending debounced changes
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    isDirtyRef.current = false;
    // Save the current content immediately when user finishes editing
    onContentChange?.(id, localContent);
    onEditSave?.(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Close on Enter with any modifier key (Ctrl, Cmd/Meta, Alt, or Shift) or on Escape
    const isEnterWithModifier =
      e.key === "Enter" && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
    if (isEnterWithModifier) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  const handleContentKeyDown = (
    e: React.KeyboardEvent<HTMLParagraphElement>,
  ) => {
    if (!isEditing && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(id);
    }
  };

  const handleDelete = () => {
    onDelete?.(id);
  };

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(id);
  };

  const handleColorChange = () => {
    cycleToNextColor();
  };

  return (
    <div
      className={`
        group/note relative p-5 pt-7 border-2
        ${isResizing ? "transition-none" : "transition-transform duration-200 ease-out"}
        ${isHovered ? "shadow-[0_10px_24px_rgba(0,0,0,0.18)]" : "shadow-[0_3px_10px_rgba(0,0,0,0.12)]"}
        ${className}
      `}
      style={{
        backgroundColor: currentStyle.bg,
        borderColor: currentStyle.border,
        width,
        height,
        borderRadius: "26px 6px 24px 6px / 6px 24px 6px 26px",
        transform: isHovered || isResizing
          ? "rotate(0deg) translateY(-2px)"
          : `rotate(${tiltDeg}deg)`,
        willChange: isHovered || isResizing ? "transform" : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Masking tape — same beige strip on every note */}
      <div
        aria-hidden
        className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 -rotate-3"
        style={{
          backgroundColor: "rgba(233, 220, 180, 0.75)",
          borderRadius: "2px",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.12), inset 0 0 4px rgba(255,255,255,0.5)",
        }}
      />

      {/* Star button + count (Top-left) */}
      <div className="absolute top-2 left-2 pointer-fine:top-3 pointer-fine:left-3 flex items-center gap-1.5 z-10">
        <button
          onClick={handleToggleStar}
          className={`min-w-11 min-h-11 pointer-fine:min-w-0 pointer-fine:min-h-0 p-2.5 pointer-fine:p-1.5 flex items-center justify-center rounded-xl shadow-sm border transition-all duration-200 hover:scale-110 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 ${
            isStarred
              ? "bg-amber-50 border-amber-300"
              : "bg-white/90 hover:bg-white border-gray-200/80"
          }`}
          title={isStarred ? "Unstar note" : "Star note"}
          aria-label={isStarred ? "Unstar note" : "Star note"}
          aria-pressed={isStarred}
        >
          <Star
            size={15}
            className={isStarred ? "text-amber-500" : "text-gray-400"}
            fill={isStarred ? "#f59e0b" : "none"}
          />
        </button>
        {starCount > 0 && (
          <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200/60 text-xs text-gray-600 font-medium tabular-nums">
            {starCount}
          </span>
        )}
      </div>
      {/* Action Buttons */}
      <div
        className={`
          absolute top-2 right-2 pointer-fine:top-3 pointer-fine:right-3 flex gap-1.5 transition-all duration-200
          ${isHovered ? "opacity-100 translate-y-0" : "opacity-100 pointer-fine:opacity-0 pointer-fine:-translate-y-1"}
        `}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleColorChange();
          }}
          className="min-w-11 min-h-11 pointer-fine:min-w-0 pointer-fine:min-h-0 p-2.5 pointer-fine:p-1.5 flex items-center justify-center bg-white/90 hover:bg-white rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 z-10"
          title="Change color"
          aria-label="Change note color"
        >
          <Paintbrush size={15} className="text-gray-500" />
        </button>
        <button
          onClick={handleEdit}
          className="min-w-11 min-h-11 pointer-fine:min-w-0 pointer-fine:min-h-0 p-2.5 pointer-fine:p-1.5 flex items-center justify-center bg-white/90 hover:bg-white rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 z-10"
          title="Edit note"
          aria-label="Edit note"
        >
          <PencilIcon size={15} className="text-gray-500" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="min-w-11 min-h-11 pointer-fine:min-w-0 pointer-fine:min-h-0 p-2.5 pointer-fine:p-1.5 flex items-center justify-center bg-white/90 hover:bg-rose-50 rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md hover:border-rose-200 focus-visible:outline-2 focus-visible:outline-rose-500 z-10"
          title="Delete note"
          aria-label="Delete note"
        >
          <TrashIcon size={15} className="text-rose-400 hover:text-rose-500" />
        </button>
      </div>

      {/* Note Content */}
      <div className="absolute top-[4.75rem] pointer-fine:top-16 right-5 bottom-14 left-5 min-h-0 overflow-hidden">
        {isEditing ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="min-h-0 w-full flex-1 p-3 text-gray-800 leading-relaxed bg-white/70 border border-gray-300/80 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-400/50 text-base pointer-fine:text-sm placeholder:text-gray-500 transition-all duration-200"
              placeholder="Type your note here..."
            />
            <div className="text-[11px] text-gray-400 font-medium">
              {isMacPlatform
                ? "⌘/⌥/⇧ + Enter or Esc to close"
                : "Ctrl/Alt/Shift + Enter or Esc to close"}
            </div>
          </div>
        ) : (
          <p
            className="h-full overflow-hidden text-gray-800 leading-relaxed text-sm cursor-pointer hover:text-black transition-colors duration-200"
            onClick={handleEdit}
            role="button"
            tabIndex={0}
            onKeyDown={handleContentKeyDown}
          >
            {localContent || (
              <span className="text-gray-500 italic">
                Click to add content...
              </span>
            )}
          </p>
        )}
      </div>

      {/* Note Footer */}
      <div className="absolute bottom-4 left-4 right-12 flex min-w-0 items-end justify-between gap-2">
        {/* Date */}
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-gray-600">
          <span className="font-medium">{formatDate(createdAt)}</span>
          {editedAt && editedAt !== createdAt && (
            <div className="flex items-center gap-1 bg-white/80 border border-gray-300/60 rounded-lg px-2 py-0.5">
              <Pen size={9} className="text-gray-500" />
              <span className="font-medium text-gray-700">
                {formatDate(editedAt)}
              </span>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex min-w-0 items-center gap-2 bg-white/85 backdrop-blur-sm rounded-xl border border-gray-200/60 shadow-sm px-2.5 py-1">
          <div
            className={`flex h-5 w-5 items-center justify-center overflow-hidden shadow-sm ${createdByPhoto ? "rounded-full bg-cover bg-center" : "rounded-lg bg-indigo-400"}`}
            style={
              createdByPhoto
                ? { backgroundImage: `url(${JSON.stringify(createdByPhoto)})` }
                : undefined
            }
            aria-hidden="true"
            data-note-author-avatar={createdByPhoto ? "photo" : "initial"}
          >
            {!createdByPhoto && (
              <span className="text-[10px] font-semibold text-white">
                {createdBy.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-gray-500 font-medium truncate text-[11px] max-w-20">
            {createdBy}
          </span>
        </div>
      </div>

      {isResizing && (
        <div
          className="pointer-events-none absolute -bottom-9 right-6 rounded-lg border border-gray-200 bg-white/95 px-2 py-1 text-[11px] font-medium tabular-nums text-gray-600 shadow-sm"
          aria-live="polite"
        >
          {Math.round(width)} × {Math.round(height)}
        </div>
      )}

      <button
        type="button"
        data-note-resize-handle
        className={`absolute right-0 bottom-0 z-20 flex h-11 w-11 touch-none cursor-nwse-resize items-end justify-end rounded-br-[18px] p-2 transition-colors focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
          isResizing
            ? "text-indigo-500 opacity-100"
            : "text-gray-600/55 opacity-60 hover:text-gray-700 focus-visible:text-gray-700 pointer-fine:opacity-0 pointer-fine:group-hover/note:opacity-60"
        }`}
        onPointerDown={(event) => onResizePointerDown?.(event, id)}
        onKeyDown={(event) => onResizeKeyDown?.(event, id)}
        aria-label={`Resize note. Current size ${Math.round(width)} by ${Math.round(height)} pixels`}
        title="Drag to resize. Arrow keys resize when focused."
      >
        <svg
          aria-hidden="true"
          className="h-[18px] w-[18px]"
          viewBox="0 0 18 18"
          fill="none"
        >
          <path
            d="M4 15L15 4M9 15L15 9M14 15L15 14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default Note;
