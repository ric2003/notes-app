export type CanvasPoint = {
  x: number;
  y: number;
};

export type PinchTransform = {
  zoom: number;
  pan: CanvasPoint;
};

type CalculatePinchTransformOptions = {
  startDistance: number;
  currentDistance: number;
  startZoom: number;
  startPan: CanvasPoint;
  startCenter: CanvasPoint;
  currentCenter: CanvasPoint;
  minZoom?: number;
  maxZoom?: number;
  sensitivity?: number;
};

type CalculateContentFitOptions = {
  items: CanvasPoint[];
  viewportWidth: number;
  viewportHeight: number;
  itemWidth?: number;
  itemHeight?: number;
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
};

export const MIN_CANVAS_ZOOM = 0.01;
export const MAX_CANVAS_ZOOM = 1;
export const PINCH_ZOOM_SENSITIVITY = 0.7;
export const CANVAS_NOTE_WIDTH = 320;
export const CANVAS_NOTE_HEIGHT = 224;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distanceBetween(first: CanvasPoint, second: CanvasPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function midpointBetween(first: CanvasPoint, second: CanvasPoint) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function calculateContentFit({
  items,
  viewportWidth,
  viewportHeight,
  itemWidth = CANVAS_NOTE_WIDTH,
  itemHeight = CANVAS_NOTE_HEIGHT,
  padding = 100,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM,
}: CalculateContentFitOptions): PinchTransform | null {
  if (
    items.length === 0 ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !Number.isFinite(itemWidth) ||
    !Number.isFinite(itemHeight) ||
    !Number.isFinite(padding) ||
    itemWidth <= 0 ||
    itemHeight <= 0 ||
    padding < 0 ||
    !items.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))
  ) {
    return null;
  }

  const minX = Math.min(...items.map((item) => item.x)) - padding;
  const maxX = Math.max(...items.map((item) => item.x + itemWidth)) + padding;
  const minY = Math.min(...items.map((item) => item.y)) - padding;
  const maxY = Math.max(...items.map((item) => item.y + itemHeight)) + padding;
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const zoom = clamp(
    Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight),
    minZoom,
    maxZoom,
  );

  return {
    zoom,
    pan: {
      x: viewportWidth / 2 - ((minX + maxX) / 2) * zoom,
      y: viewportHeight / 2 - ((minY + maxY) / 2) * zoom,
    },
  };
}

export function calculatePinchTransform({
  startDistance,
  currentDistance,
  startZoom,
  startPan,
  startCenter,
  currentCenter,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM,
  sensitivity = PINCH_ZOOM_SENSITIVITY,
}: CalculatePinchTransformOptions): PinchTransform {
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    !Number.isFinite(startZoom) ||
    startDistance <= 0 ||
    currentDistance <= 0 ||
    startZoom <= 0
  ) {
    return {
      zoom:
        Number.isFinite(startZoom) && startZoom > 0
          ? clamp(startZoom, minZoom, maxZoom)
          : minZoom,
      pan: { ...startPan },
    };
  }

  const rawScale = currentDistance / startDistance;
  const softenedScale = 1 + (rawScale - 1) * sensitivity;
  const zoom = clamp(startZoom * softenedScale, minZoom, maxZoom);
  const worldAnchor = {
    x: (startCenter.x - startPan.x) / startZoom,
    y: (startCenter.y - startPan.y) / startZoom,
  };

  return {
    zoom,
    pan: {
      x: currentCenter.x - worldAnchor.x * zoom,
      y: currentCenter.y - worldAnchor.y * zoom,
    },
  };
}
