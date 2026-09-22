import type { Item } from "../types/board";

// Pure world-space geometry helpers for the canvas. Kept out of Canvas.tsx so
// they can be tested without a viewport.

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Just the fields bounds need, so notes and items can share one signature. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Axis-aligned world bounds covering every item and rect, or null if there's
 * nothing to cover.
 *
 * Items render as `translate(x,y) rotate(r)` about origin 0 0, so a rotated
 * item's true extent is the hull of its four rotated corners. Using the raw
 * width/height would under-measure a rotated image and let it sit outside the
 * viewport after a zoom-to-fit.
 */
export function boundsOf(items: Item[], rects: Rect[] = []): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const it of items) {
    const rad = (it.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const [dx, dy] of [
      [0, 0],
      [it.width, 0],
      [0, it.height],
      [it.width, it.height],
    ]) {
      add(it.x + dx * cos - dy * sin, it.y + dx * sin + dy * cos);
    }
  }
  for (const r of rects) {
    add(r.x, r.y);
    add(r.x + r.width, r.y + r.height);
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Zoom and scroll that place `box` centred in a `viewport`-sized window with
 * `padding` screen px to spare, clamped to the allowed zoom range.
 *
 * Inverts the same relation as the canvas's screenToWorld
 * (`world = scroll + screen / zoom`): putting the box's centre at the
 * viewport's centre means scroll = centre − half a viewport of world units.
 */
export function fitView(
  box: Box,
  viewport: { width: number; height: number },
  opts: { padding: number; minZoom: number; maxZoom: number },
): { x: number; y: number; zoom: number } | null {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return null;
  const zoom = Math.min(
    opts.maxZoom,
    Math.max(
      opts.minZoom,
      Math.min(
        (viewport.width - opts.padding * 2) / w,
        (viewport.height - opts.padding * 2) / h,
      ),
    ),
  );
  return {
    x: (box.minX + box.maxX) / 2 - viewport.width / (2 * zoom),
    y: (box.minY + box.maxY) / 2 - viewport.height / (2 * zoom),
    zoom,
  };
}
