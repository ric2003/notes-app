"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface ZoomContextType {
  zoom: number;
  panX: number;
  panY: number;
  isAnimating: boolean;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToContent: (
    notes: Array<{ position_x: number; position_y: number }>
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

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 1.0;
  const ZOOM_STEP = 0.15;

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
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
    animateTransition(() => setZoom(zoom + ZOOM_STEP));
  }, [zoom, setZoom, animateTransition]);

  const zoomOut = useCallback(() => {
    animateTransition(() => setZoom(zoom - ZOOM_STEP));
  }, [zoom, setZoom, animateTransition]);

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

      // Calculate bounding box of all notes
      const padding = 100; // Extra padding around notes
      const noteWidth = 256; // Note component width
      const noteHeight = 192; // Note component min height

      const minX = Math.min(...notes.map((n) => n.position_x)) - padding;
      const maxX =
        Math.max(...notes.map((n) => n.position_x + noteWidth)) + padding;
      const minY = Math.min(...notes.map((n) => n.position_y)) - padding;
      const maxY =
        Math.max(...notes.map((n) => n.position_y + noteHeight)) + padding;

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      // Calculate zoom to fit content in container
      const zoomX = containerWidth / contentWidth;
      const zoomY = containerHeight / contentHeight;
      const newZoom = Math.min(zoomX, zoomY, MAX_ZOOM);

      // Center the content
      const centerX =
        (containerWidth - contentWidth * newZoom) / 2 - minX * newZoom;
      const centerY =
        (containerHeight - contentHeight * newZoom) / 2 - minY * newZoom;

      animateTransition(() => {
        setZoom(newZoom);
        setPan(centerX, centerY);
      });
    },
    [
      containerWidth,
      containerHeight,
      setZoom,
      setPan,
      resetZoom,
      animateTransition,
    ]
  );

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - panX) / zoom,
        y: (screenY - panY) / zoom,
      };
    },
    [zoom, panX, panY]
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: worldX * zoom + panX,
        y: worldY * zoom + panY,
      };
    },
    [zoom, panX, panY]
  );

  const value: ZoomContextType = {
    zoom,
    panX,
    panY,
    isAnimating,
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
