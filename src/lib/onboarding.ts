// The first-run tour: a short walk round the parts of the window that are not
// self-explanatory on an empty canvas. Steps anchor to real elements by their
// `data-tour` attribute, so the spotlight follows the UI instead of hard-coded
// coordinates; a step whose anchor is missing simply shows centred.
//
// Deliberately five steps. The canvas itself teaches dragging and resizing
// better than a caption can, so the tour covers only what is hidden: where
// boards live, the ways images get in, that everything is undoable, how to get
// back to a sensible zoom, and where the rest is written down.

/** Bump when the tour changes enough that returning users should see it again. */
export const TOUR_VERSION = "1";

/** settings-table key holding the last TOUR_VERSION the user finished or skipped. */
export const TOUR_SEEN_KEY = "onboarding.seen";

export type Placement = "bottom" | "top" | "left" | "right" | "center";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value of the element to spotlight; omit to centre the card. */
  anchor?: string;
  placement: Placement;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Hirameki",
    body: "A canvas that never runs out of room, for collecting images and arranging them until the collection says something. Everything stays on this machine. This takes about thirty seconds.",
    placement: "center",
  },
  {
    id: "boards",
    title: "Boards live up here",
    body: "Each tab is its own canvas, with its own background and saved position. The + button adds one; drag a tab sideways to reorder; right-click one to rename it, tag it with a colour, or give it a background.",
    anchor: "boards",
    placement: "bottom",
  },
  {
    id: "add",
    title: "Four ways to add an image",
    body: "Drop a file anywhere on the canvas, paste one with Ctrl+V, paste a link to one, or use this button. Linked images are downloaded and kept locally, so a board survives the original going away.",
    anchor: "upload",
    placement: "bottom",
  },
  {
    id: "undo",
    title: "Nothing here is permanent",
    body: "Move, resize, group, delete — all of it undoes with Ctrl+Z, including deleting. That is why deleting does not stop to ask.",
    anchor: "undo",
    placement: "bottom",
  },
  {
    id: "zoom",
    title: "Finding your way back",
    body: "Pinch the trackpad or hold Ctrl and scroll to zoom; hold Space and drag to pan. Lost? Shift+1 fits the whole board on screen. Press ? at any time for every shortcut.",
    anchor: "zoom",
    placement: "top",
  },
];

/** Keep a step index inside the tour, whatever the caller does. */
export function clampStep(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(TOUR_STEPS.length - 1, Math.max(0, Math.trunc(index)));
}

export function isLastStep(index: number): boolean {
  return clampStep(index) === TOUR_STEPS.length - 1;
}

/**
 * Whether to open the tour unprompted, given the stored value (null when the
 * user has never seen it). An older version re-opens it; the current one does
 * not. Anything unrecognised is treated as "not seen" rather than swallowed,
 * so a corrupted value shows the tour instead of hiding it forever.
 */
export function shouldAutoStart(seen: string | null): boolean {
  return seen !== TOUR_VERSION;
}
