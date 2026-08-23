"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  calculateContentFit,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
} from "@/lib/canvas-geometry";

interface ZoomContextType {
  zoom: number;
  panX: number;
  panY: number;
  isAnimating: boolean;
  containerWidth: number;
  containerHeight: number;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToContent: (
    notes: Array<{ position_x: number; position_y: number }>,
  ) => void;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

interface ZoomProviderProps {
  children: ReactNode;
  containerWidth?: number;
  containerHeight?: number;
}

export const ZoomProvider: React.FC<ZoomProviderProps> = ({
  children,
  containerWidth = 1200,
  containerHeight = 800,
}) => {
  const [zoom, setZoomState] = useState(1);
  const [panX, setPanXState] = useState(0);
  const [panY, setPanYState] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const ZOOM_STEP = 0.15;

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, newZoom)));
  }, []);

  const setPan = useCallback((x: number, y: number) => {
    setPanXState(x);
    setPanYState(y);
  }, []);

  const animateTransition = useCallback((callback: () => void) => {
    setIsAnimating(true);
    callback();
    setTimeout(() => setIsAnimating(false), 300);
  }, []);

  const zoomIn = useCallback(() => {
    const nextZoom = Math.min(MAX_CANVAS_ZOOM, zoom + ZOOM_STEP);
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    animateTransition(() => {
      setZoom(nextZoom);
      setPan(
        centerX - (centerX - panX) * (nextZoom / zoom),
        centerY - (centerY - panY) * (nextZoom / zoom),
      );
    });
  }, [
    zoom,
    panX,
    panY,
    containerWidth,
    containerHeight,
    setZoom,
    setPan,
    animateTransition,
  ]);

  const zoomOut = useCallback(() => {
    const nextZoom = Math.max(MIN_CANVAS_ZOOM, zoom - ZOOM_STEP);
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    animateTransition(() => {
      setZoom(nextZoom);
      setPan(
        centerX - (centerX - panX) * (nextZoom / zoom),
        centerY - (centerY - panY) * (nextZoom / zoom),
      );
    });
  }, [
    zoom,
    panX,
    panY,
    containerWidth,
    containerHeight,
    setZoom,
    setPan,
    animateTransition,
  ]);

  const resetZoom = useCallback(() => {
    animateTransition(() => {
      setZoom(0.5);
      setPan(0, 0); //change where it starts when there are users
    });
  }, [setZoom, setPan, animateTransition]);

  const fitToContent = useCallback(
    (notes: Array<{ position_x: number; position_y: number }>) => {
      if (notes.length === 0) {
        resetZoom();
        return;
      }

      const fit = calculateContentFit({
        items: notes.map((note) => ({
          x: note.position_x,
          y: note.position_y,
        })),
        viewportWidth: containerWidth,
        viewportHeight: containerHeight,
      });
      if (!fit) return;

      animateTransition(() => {
        setZoom(fit.zoom);
        setPan(fit.pan.x, fit.pan.y);
      });
    },
    [
      containerWidth,
      containerHeight,
      setZoom,
      setPan,
      resetZoom,
      animateTransition,
    ],
  );

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - panX) / zoom,
        y: (screenY - panY) / zoom,
      };
    },
    [zoom, panX, panY],
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: worldX * zoom + panX,
        y: worldY * zoom + panY,
      };
    },
    [zoom, panX, panY],
  );

  const value: ZoomContextType = {
    zoom,
    panX,
    panY,
    isAnimating,
    containerWidth,
    containerHeight,
    setZoom,
    setPan,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToContent,
    screenToWorld,
    worldToScreen,
  };

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
};

export const useZoom = (): ZoomContextType => {
  const context = useContext(ZoomContext);
  if (context === undefined) {
    throw new Error("useZoom must be used within a ZoomProvider");
  }
  return context;
};
