export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasRect = CanvasPoint & {
  width: number;
  height: number;
};

export type NoteSize = {
  width: number;
  height: number;
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
  items: CanvasRect[];
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
};

type CalculateNoteResizeOptions = {
  startSize: NoteSize;
  startPointer: CanvasPoint;
  currentPointer: CanvasPoint;
};

export const MIN_CANVAS_ZOOM = 0.01;
export const MAX_CANVAS_ZOOM = 1;
export const PINCH_ZOOM_SENSITIVITY = 0.7;
export const CANVAS_NOTE_WIDTH = 320;
export const CANVAS_NOTE_HEIGHT = 224;
export const MIN_NOTE_WIDTH = 240;
export const MIN_NOTE_HEIGHT = 180;
export const MAX_NOTE_WIDTH = 960;
export const MAX_NOTE_HEIGHT = 720;

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

export function clampNoteSize(width: number, height: number): NoteSize {
  return {
    width: clamp(width, MIN_NOTE_WIDTH, MAX_NOTE_WIDTH),
    height: clamp(height, MIN_NOTE_HEIGHT, MAX_NOTE_HEIGHT),
  };
}

export function normalizeNoteSize(
  width: unknown,
  height: unknown,
): NoteSize {
  return clampNoteSize(
    typeof width === "number" && Number.isFinite(width)
      ? width
      : CANVAS_NOTE_WIDTH,
    typeof height === "number" && Number.isFinite(height)
      ? height
      : CANVAS_NOTE_HEIGHT,
  );
}

export function getNoteBounds(note: {
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
}): CanvasRect {
  const size = normalizeNoteSize(note.width, note.height);
  return {
    x: note.position_x,
    y: note.position_y,
    ...size,
  };
}

export function getNoteCenter(note: {
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
}): CanvasPoint {
  const bounds = getNoteBounds(note);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function calculateNoteResize({
  startSize,
  startPointer,
  currentPointer,
}: CalculateNoteResizeOptions): NoteSize {
  return clampNoteSize(
    startSize.width + currentPointer.x - startPointer.x,
    startSize.height + currentPointer.y - startPointer.y,
  );
}

export function calculateContentFit({
  items,
  viewportWidth,
  viewportHeight,
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
    !Number.isFinite(padding) ||
    padding < 0 ||
    !items.every(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height) &&
        item.width > 0 &&
        item.height > 0,
    )
  ) {
    return null;
  }

  const minX = Math.min(...items.map((item) => item.x)) - padding;
  const maxX = Math.max(...items.map((item) => item.x + item.width)) + padding;
  const minY = Math.min(...items.map((item) => item.y)) - padding;
  const maxY = Math.max(...items.map((item) => item.y + item.height)) + padding;
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
