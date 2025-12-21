"use client";

import { useZoom } from "@/contexts/ZoomContext";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";

interface ZoomControlsProps {
  notes: Array<{ position_x: number; position_y: number }>;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ notes }) => {
  const { zoom, zoomIn, zoomOut, resetZoom, fitToContent } = useZoom();

  return (
    <div className="hidden md:flex items-center gap-1 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl p-1.5 shadow-lg">
      <button
        onClick={zoomOut}
        className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent"
        title="Zoom Out"
        disabled={zoom <= 0.1}
      >
        <ZoomOut
          size={16}
          className={zoom <= 0.1 ? "text-gray-300" : "text-gray-600"}
        />
      </button>

      <div className="py-1.5 text-sm font-medium text-gray-600 min-w-[56px] text-center tabular-nums">
        {Math.round(zoom * 100)}%
      </div>

      <button
        onClick={zoomIn}
        className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent"
        title="Zoom In"
        disabled={zoom >= 1.0}
      >
        <ZoomIn
          size={16}
          className={zoom >= 1.0 ? "text-gray-300" : "text-gray-600"}
        />
      </button>

      <div className="w-px h-6 bg-gray-200/80 mx-1" />

      <button
        onClick={resetZoom}
        className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105"
        title="Reset Zoom (1:1)"
      >
        <RotateCcw size={16} className="text-gray-600" />
      </button>

      <button
        onClick={() => fitToContent(notes)}
        className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent"
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
