"use client";

import { useEffect, useState } from "react";
import { Map, X } from "lucide-react";
import MiniMap from "@/components/MiniMap";

type MobileMiniMapProps = {
  notes: Array<{
    id: string;
    color: string;
    position_x: number;
    position_y: number;
  }>;
};

export default function MobileMiniMap({ notes }: MobileMiniMapProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        className="group flex h-[58px] w-[58px] items-center justify-center rounded-2xl border border-white/70 bg-white/95 p-1.5 text-gray-600 shadow-lg backdrop-blur-xl focus-visible:outline-2 focus-visible:outline-indigo-500"
        aria-label={isOpen ? "Close board minimap" : "Open board minimap"}
        aria-expanded={isOpen}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105 group-hover:bg-gray-100">
          {isOpen ? <X size={18} /> : <Map size={18} />}
        </span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 bottom-full mb-2 animate-scale-in"
          data-mobile-minimap
        >
          <MiniMap notes={notes} />
        </div>
      )}
    </div>
  );
}
