import React, { useState, useCallback, useRef, useEffect } from "react";
import { PencilIcon, TrashIcon, Paintbrush, Pen } from "lucide-react";
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
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [localContent, setLocalContent] = useState(content);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      bg: "bg-gradient-to-br from-yellow-100 to-yellow-200",
      border: "border-yellow-300",
      shadow: "shadow-yellow-200/50",
    },
    blue: {
      bg: "bg-gradient-to-br from-blue-100 to-blue-200",
      border: "border-blue-300",
      shadow: "shadow-blue-200/50",
    },
    green: {
      bg: "bg-gradient-to-br from-green-100 to-green-200",
      border: "border-green-300",
      shadow: "shadow-green-200/50",
    },
    pink: {
      bg: "bg-gradient-to-br from-pink-100 to-pink-200",
      border: "border-pink-300",
      shadow: "shadow-pink-200/50",
    },
    purple: {
      bg: "bg-gradient-to-br from-purple-100 to-purple-200",
      border: "border-purple-300",
      shadow: "shadow-purple-200/50",
    },
    orange: {
      bg: "bg-gradient-to-br from-orange-100 to-orange-200",
      border: "border-orange-300",
      shadow: "shadow-orange-200/50",
    },
  };

  const currentStyle = colorStyles[color] || colorStyles.yellow;

  const handleEdit = (e: React.MouseEvent) => {
    if (isEditing) {
      return;
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
    // Only handle specific shortcuts, let everything else pass through
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    onDelete?.(id);
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
        relative w-80 min-h-56 p-4 rounded-xl border-2 transition-all duration-200
        ${currentStyle.bg} ${currentStyle.border}
        ${isHovered ? `shadow-lg ${currentStyle.shadow} scale-105` : "shadow-md"}
        ${className}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Action Buttons */}
      <div
        className={`
          absolute top-2 right-2 flex gap-2 transition-opacity duration-200
          ${isHovered ? "opacity-100" : "opacity-0"}
        `}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleColorChange(e);
          }}
          className="p-1.5 bg-white/80 hover:bg-white rounded-full shadow-sm border border-gray-200 transition-all duration-150 hover:scale-110 z-10"
          title="Paint note"
        >
          <RainbowIcon icon={Paintbrush} size={16} />
        </button>
        <button
          onClick={handleEdit}
          className="p-1.5 bg-white/80 hover:bg-white rounded-full shadow-sm border border-gray-200 transition-all duration-150 hover:scale-110 z-10"
          title="Edit note"
        >
          <PencilIcon size={16} className="text-gray-600" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(e);
          }}
          className="p-1.5 bg-white/80 hover:bg-red-50 rounded-full shadow-sm border border-gray-200 transition-all duration-150 hover:scale-110 z-10"
          title="Delete note"
        >
          <TrashIcon size={16} className="text-red-500" />
        </button>
      </div>

      {/* Note Content */}
      <div className="mt-8 mb-12">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-full h-24 p-2 text-gray-700 leading-relaxed border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              placeholder="Type your note here..."
            />
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Ctrl+Enter to save</span>
              <span>Esc to cancel</span>
            </div>
          </div>
        ) : (
          <p
            className="text-gray-700 leading-relaxed text-sm line-clamp-4 cursor-pointer"
            onClick={handleEdit}
          >
            {localContent || "Click edit to add content..."}
          </p>
        )}
      </div>

      {/* Note Footer */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
        {/* Date */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium">{formatDate(createdAt)}</span>
          {editedAt && editedAt !== createdAt && (
            <div className="flex items-center gap-1 bg-white/80 border border-gray-200/60 rounded-full px-2 py-1">
              <Pen size={10} className="text-gray-600" />
              <span className="font-medium text-gray-600 text-xs">
                {`edited ${formatDate(editedAt)}`}
              </span>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full border border-gray-200/60 shadow-sm px-2 py-1">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <span className="font-bold text-white text-xs">
              {createdBy.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-gray-600 font-medium truncate text-xs max-w-16">
            {createdBy}
          </span>
        </div>
      </div>

      {/* Bottom Shadow for depth */}
      <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-black/5 rounded-full blur-sm" />
    </div>
  );
};

export default Note;
