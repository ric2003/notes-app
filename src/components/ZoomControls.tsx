"use client";

import { useZoom } from "@/contexts/ZoomContext";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "@/lib/canvas-geometry";

interface ZoomControlsProps {
  notes: Array<{ position_x: number; position_y: number }>;
  className?: string;
  compactOnNarrowScreens?: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  notes,
  className = "",
  compactOnNarrowScreens = false,
}) => {
  const { zoom, zoomIn, zoomOut, resetZoom, fitToContent } = useZoom();

  return (
    <div
      className={`flex items-center gap-1 bg-white/95 backdrop-blur-xl border border-white/70 rounded-2xl p-1.5 shadow-lg ${className}`}
      aria-label="Canvas zoom controls"
    >
      <button
        onClick={zoomOut}
        className="min-w-11 min-h-11 flex items-center justify-center p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-indigo-500"
        title="Zoom Out"
        aria-label="Zoom out"
        disabled={zoom <= MIN_CANVAS_ZOOM}
      >
        <ZoomOut
          size={16}
          className={
            zoom <= MIN_CANVAS_ZOOM ? "text-gray-300" : "text-gray-600"
          }
        />
      </button>

      <div
        className={`${compactOnNarrowScreens ? "hidden min-[375px]:block" : ""} min-w-[48px] py-1.5 text-center text-sm font-medium text-gray-600 tabular-nums`}
        aria-live="polite"
      >
        {Math.round(zoom * 100)}%
      </div>

      <button
        onClick={zoomIn}
        className="min-w-11 min-h-11 flex items-center justify-center p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-indigo-500"
        title="Zoom In"
        aria-label="Zoom in"
        disabled={zoom >= MAX_CANVAS_ZOOM}
      >
        <ZoomIn
          size={16}
          className={
            zoom >= MAX_CANVAS_ZOOM ? "text-gray-300" : "text-gray-600"
          }
        />
      </button>

      <div className="w-px h-6 bg-gray-200/80 mx-1" />

      <button
        onClick={resetZoom}
        className="min-w-11 min-h-11 flex items-center justify-center p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-indigo-500"
        title="Reset View"
        aria-label="Reset view"
      >
        <RotateCcw size={16} className="text-gray-600" />
      </button>

      <button
        onClick={() => fitToContent(notes)}
        className="min-w-11 min-h-11 flex items-center justify-center p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-indigo-500"
        title="Fit All Notes"
        aria-label="Fit all notes"
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
