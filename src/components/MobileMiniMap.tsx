"use client";

import { useCallback, useEffect, useState } from "react";
import { Map, Move, X } from "lucide-react";
import MiniMap from "@/components/MiniMap";

type MobileMiniMapProps = {
  notes: Array<{
    id: string;
    color: string;
    position_x: number;
    position_y: number;
  }>;
};

const MINIMAP_HINT_DISMISSED_KEY = "notesAppMinimapHintDismissed";

export default function MobileMiniMap({ notes }: MobileMiniMapProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      setShowHint(
        window.localStorage.getItem(MINIMAP_HINT_DISMISSED_KEY) !== "true",
      );
    } catch {
      setShowHint(true);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      window.localStorage.setItem(MINIMAP_HINT_DISMISSED_KEY, "true");
    } catch {
      // The hint still stays hidden for the current session.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  if (notes.length === 0) return null;

  return (
    <div className="relative shrink-0 pointer-fine:hidden prevent-zoom">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="group flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white/95 p-1 text-gray-600 shadow-lg backdrop-blur-xl focus-visible:outline-2 focus-visible:outline-indigo-500"
        aria-label={isOpen ? "Close board minimap" : "Open board minimap"}
        aria-expanded={isOpen}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105 group-hover:bg-gray-100">
          {isOpen ? <X size={18} /> : <Map size={18} />}
        </span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 bottom-full mb-2 flex w-44 flex-col gap-2 animate-scale-in"
          data-mobile-minimap
        >
          {showHint && (
            <div
              className="pointer-events-none flex items-center gap-2 rounded-xl border border-white/70 bg-slate-900/90 px-3 py-2 text-[11px] font-medium leading-4 text-white shadow-lg backdrop-blur-xl"
              data-minimap-hint
            >
              <Move className="h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span>Tap any spot or drag to move around.</span>
            </div>
          )}
          <MiniMap notes={notes} onNavigate={dismissHint} />
        </div>
      )}
    </div>
  );
}
