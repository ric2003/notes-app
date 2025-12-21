import React, { useState, useCallback, useRef, useEffect } from "react";
import { PencilIcon, TrashIcon, Paintbrush, Pen, Star } from "lucide-react";
import RainbowIcon from "./RainbowIcon";

export interface NoteProps {
  id: string;
  title: string;
  content: string;
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
  editedAt?: string;
  isStarred?: boolean;
  starCount?: number;
  onToggleStar?: (id: string) => void;
}

const Note: React.FC<NoteProps> = ({
  id,
  content,
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
  editedAt,
  isStarred = false,
  starCount = 0,
  onToggleStar,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [localContent, setLocalContent] = useState(content);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const debouncedContentChange = useCallback(
    (newContent: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        onContentChange?.(id, newContent);
      }, 1000);
    },
    [id, onContentChange]
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

  const colorStyles = {
    yellow: {
      bg: "bg-gradient-to-br from-amber-50 via-yellow-100 to-amber-200",
      border: "border-amber-300/70",
      shadow: "shadow-amber-200/40",
      accent: "#f59e0b",
    },
    blue: {
      bg: "bg-gradient-to-br from-sky-50 via-blue-100 to-indigo-200",
      border: "border-blue-300/70",
      shadow: "shadow-blue-200/40",
      accent: "#3b82f6",
    },
    green: {
      bg: "bg-gradient-to-br from-emerald-50 via-green-100 to-teal-200",
      border: "border-emerald-300/70",
      shadow: "shadow-emerald-200/40",
      accent: "#10b981",
    },
    pink: {
      bg: "bg-gradient-to-br from-pink-50 via-rose-100 to-pink-200",
      border: "border-pink-300/70",
      shadow: "shadow-pink-200/40",
      accent: "#ec4899",
    },
    purple: {
      bg: "bg-gradient-to-br from-violet-50 via-purple-100 to-indigo-200",
      border: "border-purple-300/70",
      shadow: "shadow-purple-200/40",
      accent: "#8b5cf6",
    },
    orange: {
      bg: "bg-gradient-to-br from-orange-50 via-orange-100 to-amber-200",
      border: "border-orange-300/70",
      shadow: "shadow-orange-200/40",
      accent: "#f97316",
    },
  };

  const currentStyle = colorStyles[color] || colorStyles.yellow;

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
    // Only debounce if we're not in editing mode to avoid blocking
    if (!isEditing) {
      debouncedContentChange(newContent);
    }
  };

  const handleSaveEdit = () => {
    // Clear any pending debounced changes
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
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
    e: React.KeyboardEvent<HTMLParagraphElement>
  ) => {
    if (!isEditing && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    onDelete?.(id);
  };

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar?.(id);
  };

  const handleColorChange = (e: React.MouseEvent) => {
    const colors: NoteProps["color"][] = [
      "yellow",
      "blue",
      "green",
      "pink",
      "purple",
      "orange",
    ];
    const currentIndex = colors.indexOf(color || "blue");
    const nextIndex = (currentIndex + 1) % colors.length;
    const nextColor = colors[nextIndex];
    onColorChange?.(id, nextColor || "yellow");
  };

  return (
    <div
      className={`
        relative w-80 min-h-56 p-5 rounded-2xl border transition-all duration-300 ease-out
        ${currentStyle.bg} ${currentStyle.border}
        ${isHovered ? `shadow-xl ${currentStyle.shadow} scale-[1.02]` : "shadow-lg shadow-gray-200/50"}
        ${className}
      `}
      style={{
        willChange: "transform",
        backdropFilter: "blur(8px)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Star button + count (Top-left) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        <button
          onClick={handleToggleStar}
          className={`p-1.5 rounded-xl shadow-sm border transition-all duration-200 hover:scale-110 hover:shadow-md ${isStarred
            ? "bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-300"
            : "bg-white/90 hover:bg-white border-gray-200/80"
            }`}
          title={isStarred ? "Unstar note" : "Star note"}
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
          absolute top-3 right-3 flex gap-1.5 transition-all duration-200
          ${isHovered ? "opacity-100 translate-y-0" : "opacity-100 md:opacity-0 md:-translate-y-1"}
        `}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleColorChange(e);
          }}
          className="p-1.5 bg-white/90 hover:bg-white rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md z-10"
          title="Change color"
        >
          <RainbowIcon icon={Paintbrush} size={15} />
        </button>
        <button
          onClick={handleEdit}
          className="p-1.5 bg-white/90 hover:bg-white rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md z-10"
          title="Edit note"
        >
          <PencilIcon size={15} className="text-gray-500" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(e);
          }}
          className="p-1.5 bg-white/90 hover:bg-rose-50 rounded-xl shadow-sm border border-gray-200/80 transition-all duration-200 hover:scale-110 hover:shadow-md hover:border-rose-200 z-10"
          title="Delete note"
        >
          <TrashIcon size={15} className="text-rose-400 hover:text-rose-500" />
        </button>
      </div>

      {/* Note Content */}
      <div className="mt-10 mb-14">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-full h-28 p-3 text-gray-700 leading-relaxed bg-white/60 border border-gray-200/80 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 text-sm placeholder:text-gray-400 transition-all duration-200"
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
            className="text-gray-600 leading-relaxed text-sm line-clamp-5 cursor-pointer hover:text-gray-800 transition-colors duration-200"
            onClick={handleEdit}
            role="button"
            tabIndex={0}
            onKeyDown={handleContentKeyDown}
          >
            {localContent || (
              <span className="text-gray-400 italic">Click to add content...</span>
            )}
          </p>
        )}
      </div>

      {/* Note Footer */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
        {/* Date */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="font-medium">{formatDate(createdAt)}</span>
          {editedAt && editedAt !== createdAt && (
            <div className="flex items-center gap-1 bg-white/80 border border-gray-200/60 rounded-lg px-2 py-0.5">
              <Pen size={9} className="text-gray-400" />
              <span className="font-medium text-gray-500">
                {formatDate(editedAt)}
              </span>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-xl border border-gray-200/60 shadow-sm px-2.5 py-1">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-sm">
            <span className="font-semibold text-white text-[10px]">
              {createdBy.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-gray-500 font-medium truncate text-[11px] max-w-20">
            {createdBy}
          </span>
        </div>
      </div>

      {/* Subtle bottom accent */}
      <div
        className="absolute -bottom-px left-4 right-4 h-px rounded-full opacity-30"
        style={{ background: `linear-gradient(90deg, transparent, ${(colorStyles[color] || colorStyles.yellow).accent}, transparent)` }}
      />
    </div>
  );
};

export default Note;
