"use client";

import { useCallback, useRef } from "react";
import { useZoom } from "@/contexts/ZoomContext";
import { NOTE_COLORS, type NoteColorName } from "@/lib/noteColors";

interface MiniMapProps {
  notes: Array<{
    id: string;
    color: string;
    position_x: number;
    position_y: number;
  }>;
}

const NOTE_W = 320;
const NOTE_H = 224;
const MAP_W = 176;
const MAP_H = 132;
// World-space breathing room around the content bounds
const WORLD_PADDING = 400;

export default function MiniMap({ notes }: MiniMapProps) {
  const {
    zoom,
    panX,
    panY,
    containerWidth,
    containerHeight,
    setPan,
  } = useZoom();
  const mapRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Viewport rect in world coordinates
  const vpX = -panX / zoom;
  const vpY = -panY / zoom;
  const vpW = containerWidth / zoom;
  const vpH = containerHeight / zoom;

  // World bounds covering every note AND the current viewport, so both
  // are always visible on the map
  let minX = vpX;
  let minY = vpY;
  let maxX = vpX + vpW;
  let maxY = vpY + vpH;
  for (const n of notes) {
    minX = Math.min(minX, n.position_x);
    minY = Math.min(minY, n.position_y);
    maxX = Math.max(maxX, n.position_x + NOTE_W);
    maxY = Math.max(maxY, n.position_y + NOTE_H);
  }
  minX -= WORLD_PADDING;
  minY -= WORLD_PADDING;
  maxX += WORLD_PADDING;
  maxY += WORLD_PADDING;

  const worldW = Math.max(maxX - minX, 1);
  const worldH = Math.max(maxY - minY, 1);
  const scale = Math.min(MAP_W / worldW, MAP_H / worldH);
  const offX = (MAP_W - worldW * scale) / 2;
  const offY = (MAP_H - worldH * scale) / 2;

  const worldToMap = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - minX) * scale + offX,
      y: (wy - minY) * scale + offY,
    }),
    [minX, minY, scale, offX, offY]
  );

  const centerCameraOn = useCallback(
    (mapX: number, mapY: number) => {
      const wx = (mapX - offX) / scale + minX;
      const wy = (mapY - offY) / scale + minY;
      setPan(
        containerWidth / 2 - wx * zoom,
        containerHeight / 2 - wy * zoom
      );
    },
    [offX, offY, scale, minX, minY, setPan, containerWidth, containerHeight, zoom]
  );

  const mapPointFromEvent = (e: React.PointerEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, MAP_W)),
      y: Math.max(0, Math.min(e.clientY - rect.top, MAP_H)),
    };
  };

  if (notes.length === 0) return null;

  const viewportRect = worldToMap(vpX, vpY);

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-lg"
      style={{ width: MAP_W, height: MAP_H }}
      ref={mapRef}
      // Keep canvas pan/wheel handlers from hijacking minimap interaction
      onPointerDown={(e) => {
        e.stopPropagation();
        const pt = mapPointFromEvent(e);
        if (!pt) return;
        isDraggingRef.current = true;
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {}
        centerCameraOn(pt.x, pt.y);
      }}
      onPointerMove={(e) => {
        if (!isDraggingRef.current) return;
        const pt = mapPointFromEvent(e);
        if (pt) centerCameraOn(pt.x, pt.y);
      }}
      onPointerUp={() => {
        isDraggingRef.current = false;
      }}
      onPointerCancel={() => {
        isDraggingRef.current = false;
      }}
      onWheel={(e) => e.stopPropagation()}
      role="application"
      aria-label="Board minimap"
      title="Minimap — click or drag to navigate"
    >
      {/* Note chips */}
      {notes.map((n) => {
        const pos = worldToMap(n.position_x, n.position_y);
        const chipW = Math.max(NOTE_W * scale, 5);
        const chipH = Math.max(NOTE_H * scale, 4);
        const c = NOTE_COLORS[n.color as NoteColorName];
        return (
          <div
            key={n.id}
            className="absolute rounded-[2px]"
            style={{
              left: pos.x,
              top: pos.y,
              width: chipW,
              height: chipH,
              backgroundColor: c ? c.bg : "#e5e7eb",
              border: `1px solid ${c ? c.border : "#d1d5db"}`,
            }}
          />
        );
      })}

      {/* Current viewport */}
      <div
        className="absolute border-2 border-indigo-500/80 bg-indigo-500/10 rounded-[2px] pointer-events-none"
        style={{
          left: viewportRect.x,
          top: viewportRect.y,
          width: Math.max(vpW * scale, 8),
          height: Math.max(vpH * scale, 8),
        }}
      />
    </div>
  );
}
