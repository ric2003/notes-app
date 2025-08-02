import React, { useState } from 'react';
import { 
  PencilIcon, 
  TrashIcon, 
  GripVerticalIcon 
} from 'lucide-react';

export interface NoteProps {
  id: string;
  title: string;
  content: string;
  color?: 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange';
  isEditing?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onContentChange?: (id: string, content: string) => void;
  onEditSave?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  className?: string;
}

const Note: React.FC<NoteProps> = ({
  id,
  title,
  content,
  color = 'blue',
  isEditing = false,
  onEdit,
  onDelete,
  onContentChange,
  onEditSave,
  onDragStart,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const colorStyles = {
    yellow: {
      bg: 'bg-gradient-to-br from-yellow-100 to-yellow-200',
      border: 'border-yellow-300',
      shadow: 'shadow-yellow-200/50',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-100 to-blue-200',
      border: 'border-blue-300',
      shadow: 'shadow-blue-200/50',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-100 to-green-200',
      border: 'border-green-300',
      shadow: 'shadow-green-200/50',
    },
    pink: {
      bg: 'bg-gradient-to-br from-pink-100 to-pink-200',
      border: 'border-pink-300',
      shadow: 'shadow-pink-200/50',
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-100 to-purple-200',
      border: 'border-purple-300',
      shadow: 'shadow-purple-200/50',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-100 to-orange-200',
      border: 'border-orange-300',
      shadow: 'shadow-orange-200/50',
    },
  };

  const currentStyle = colorStyles[color] || colorStyles.yellow;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    onDragStart?.(e, id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    onEdit?.(id);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange?.(id, e.target.value);
  };

  const handleSaveEdit = () => {
    onEditSave?.(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleSaveEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    onDelete?.(id);
  };

  return (
    <div
      className={`
        relative w-64 min-h-48 p-4 rounded-xl border-2 transition-all duration-200
        ${currentStyle.bg} ${currentStyle.border}
        ${isHovered ? `shadow-lg ${currentStyle.shadow} scale-105` : 'shadow-md'}
        ${isDragging ? 'opacity-50 rotate-3' : ''}
        ${className}
      `}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
    >

      {/* Drag Handle */}
      <div 
        className="note-drag-handle absolute top-2 left-2 cursor-grab active:cursor-grabbing p-1 rounded z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onDragStart?.(e as unknown as React.DragEvent, id);
        }}
      >
        <GripVerticalIcon size={16} className="text-gray-400" />
      </div>

      {/* Action Buttons */}
      <div className={`
        absolute top-2 right-2 flex gap-1 transition-opacity duration-200
        ${isHovered ? 'opacity-100' : 'opacity-0'}
      `}>
        <button
          onClick={(e) => { e.stopPropagation(); handleEdit(e); }}
          className="p-1.5 bg-white/80 hover:bg-white rounded-full shadow-sm border border-gray-200 transition-all duration-150 hover:scale-110 z-10"
          title="Edit note"
        >
          <PencilIcon size={14} className="text-gray-600" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(e); }}
          className="p-1.5 bg-white/80 hover:bg-red-50 rounded-full shadow-sm border border-gray-200 transition-all duration-150 hover:scale-110 z-10"
          title="Delete note"
        >
          <TrashIcon size={14} className="text-red-500" />
        </button>
      </div>

      {/* Note Content */}
      <div className="mt-4 space-y-3">
        <h3 className="font-semibold text-gray-800 text-lg leading-tight line-clamp-2">
          {title}
        </h3>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-full h-20 p-2 text-gray-700 text-sm leading-relaxed border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Type your note here..."
              autoFocus
            />
            <div className="flex gap-2 text-xs text-gray-500">
              <span>Ctrl+Enter to save</span>
              <span>Esc to cancel</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-700 text-sm leading-relaxed line-clamp-4">
            {content || "Click edit to add content..."}
          </p>
        )}
      </div>

      {/* Bottom Shadow for depth */}
      <div className="absolute -bottom-1 left-2 right-2 h-1 bg-black/5 rounded-full blur-sm" />
    </div>
  );
};

export default Note;