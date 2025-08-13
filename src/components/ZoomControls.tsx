"use client";

import { useZoom } from "@/contexts/ZoomContext";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";

interface ZoomControlsProps {
  notes: Array<{ position_x: number; position_y: number }>;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ notes }) => {
  const { zoom, zoomIn, zoomOut, resetZoom, fitToContent } = useZoom();

  return (
    <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-1 shadow-lg">
      <button
        onClick={zoomOut}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
        title="Zoom Out"
        disabled={zoom <= 0.1}
      >
        <ZoomOut
          size={16}
          className={zoom <= 0.1 ? "text-gray-300" : "text-gray-600"}
        />
      </button>

      <div className="px-2 py-1 text-sm font-mono text-gray-600 min-w-[60px] text-center">
        {Math.round(zoom * 100)}%
      </div>

      <button
        onClick={zoomIn}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
        title="Zoom In"
        disabled={zoom >= 5.0}
      >
        <ZoomIn
          size={16}
          className={zoom >= 5.0 ? "text-gray-300" : "text-gray-600"}
        />
      </button>

      <div className="w-px h-6 bg-gray-200" />

      <button
        onClick={resetZoom}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
        title="Reset Zoom (1:1)"
      >
        <RotateCcw size={16} className="text-gray-600" />
      </button>

      <button
        onClick={() => fitToContent(notes)}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
        title="Fit All Notes"
        disabled={notes.length === 0}
      >
        <Maximize2
          size={16}
          className={notes.length === 0 ? "text-gray-300" : "text-gray-600"}
        />
      </button>
    </div>
  );
};

export default ZoomControls;
