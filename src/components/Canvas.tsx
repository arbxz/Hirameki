import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteViewer from "react-infinite-viewer";
import {
  BringToFront,
  Group as GroupIcon,
  ImagePlus,
  Maximize,
  Minus,
  Plus,
  Redo2,
  SendToBack,
  StickyNote,
  Trash2,
  Undo2,
  Ungroup,
} from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { toast, useToastStore } from "../store/toastStore";
import {
  ingestDataTransfer,
  ingestFiles,
  type IngestResult,
  type OnProgress,
} from "../lib/ingest";
import { ItemView } from "./ItemView";
import { NoteView } from "./NoteView";
import { SelectionLayer } from "./SelectionLayer";
import { BoardBackground } from "./BoardBackground";
import { BoardTabs } from "./BoardTabs";
import { ShortcutsModal } from "./ShortcutsModal";
import { useMenuKeyboard } from "./useMenuKeyboard";
import { boundsOf, fitView, type Box } from "../lib/geometry";

// Phase 4: items can be selected (click / shift-click / marquee), then dragged,
// resized, rotated, reordered, and deleted. Navigation (Space-pan, Ctrl-zoom)
// and ingestion (drop / paste / upload) from earlier phases are unchanged.

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const GRID = 40;
// Ctrl+wheel zoom, as exponents so zooming in and back out is symmetric.
// One mouse notch is a fixed step; a touchpad pinch scales with its own delta.
const WHEEL_ZOOM_STEP = 0.12;
const PINCH_ZOOM_RATE = 0.01;

// Margin left around the content when zooming to fit, in screen px.
const FIT_PADDING = 80;

// How long an ingest may run before it earns a spinner. Dropping a single local
// file usually finishes well inside this, and flashing a toast for it would be
// noisier than the image simply appearing.
const SPINNER_DELAY = 350;

/**
 * Runs an ingest batch with progress reporting. Downloading a remote image goes
 * through Rust and can take seconds, during which the app previously showed
 * nothing at all — so a slow batch gets a live progress toast, and a batch with
 * failures always reports them (a partial success used to be indistinguishable
 * from doing nothing).
 */
async function withIngestFeedback(
  run: (onProgress: OnProgress) => Promise<IngestResult>,
): Promise<void> {
  const toasts = () => useToastStore.getState();
  let toastId: string | null = null;
  let seen = { done: 0, total: 0 };

  const label = () =>
    seen.total > 1
      ? `Adding ${seen.done + 1} of ${seen.total}…`
      : "Adding image…";

  const timer = setTimeout(() => {
    toastId = toast.progress(label());
  }, SPINNER_DELAY);

  const onProgress: OnProgress = (done, total) => {
    seen = { done, total };
    if (toastId && done < total) toasts().update(toastId, { message: label() });
  };

  let result: IngestResult;
  try {
    result = await run(onProgress);
  } catch (e) {
    // A whole-batch failure (rather than a per-image one).
    clearTimeout(timer);
    if (toastId) toasts().dismiss(toastId);
    toast.error(`Couldn't add images: ${String(e)}`);
    return;
  }
  clearTimeout(timer);

  const { added, failed, error } = result;
  if (failed > 0) {
    if (toastId) toasts().dismiss(toastId);
    const what = added > 0 ? `${failed} of ${added + failed} images` : "image";
    toast.error(`Couldn't add ${what}${error ? `: ${error}` : ""}`);
    return;
  }
  if (!toastId) return; // fast path: the images appearing is feedback enough
  if (added === 0) {
    toasts().dismiss(toastId);
  } else {
    toasts().update(toastId, {
      kind: "success",
      message: `Added ${added} ${added === 1 ? "image" : "images"}`,
    });
  }
}

/** Inline keycap for the empty-state hints. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="ui-mono mx-0.5 rounded-[3px] border border-[var(--border)] bg-[var(--surface)] px-1 py-px text-[var(--text)]">
      {children}
    </span>
  );
}

export function Canvas() {
  const viewerRef = useRef<InfiniteViewer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const board = useBoardStore((s) => s.board);
  const items = useBoardStore((s) => s.items);
  const notes = useBoardStore((s) => s.notes);
  const loading = useBoardStore((s) => s.loading);
  const init = useBoardStore((s) => s.init);
  const setView = useBoardStore((s) => s.setView);
  const addItem = useBoardStore((s) => s.addItem);
  const addNote = useBoardStore((s) => s.addNote);
  const setError = useBoardStore((s) => s.setError);
  const removeItems = useBoardStore((s) => s.removeItems);
  const bringToFront = useBoardStore((s) => s.bringToFront);
  const sendToBack = useBoardStore((s) => s.sendToBack);
  const groupItems = useBoardStore((s) => s.groupItems);
  const ungroupItems = useBoardStore((s) => s.ungroupItems);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const undoLabel = useBoardStore((s) => s.undoLabel);
  const redoLabel = useBoardStore((s) => s.redoLabel);

  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Shift frees the aspect-ratio lock while resizing (see SelectionLayer).
  const [shiftHeld, setShiftHeld] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  useMenuKeyboard(zoomMenuRef, zoomMenu, () => setZoomMenu(false));
  const [middlePanning, setMiddlePanning] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Right-click "Add note here" menu: screen position + the world point to place
  // the note at (null = closed).
  const [noteMenu, setNoteMenu] = useState<{
    screenX: number;
    screenY: number;
    world: { x: number; y: number };
  } | null>(null);
  // Refs are null on first render; flip after mount so SelectionLayer re-renders
  // once the container/world elements actually exist.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Delete straight away and offer an undo, rather than gating on a modal:
  // the action is now reversible, so a confirmation would be friction on every
  // delete to guard against a mistake the undo already covers. (Board deletion
  // still confirms — that one isn't undoable.)
  const deleteItems = (ids: string[]) => {
    if (!ids.length) return;
    const count = ids.length;
    const topBefore = useBoardStore.getState().undoId;
    setSelectedIds([]);
    void removeItems(ids)
      .then(() => {
        // removeItems reports its own failures and resolves without recording
        // an entry. Offering Undo then would reverse the *previous* action.
        const entryId = useBoardStore.getState().undoId;
        if (!entryId || entryId === topBefore) return;
        // Bind the toast to this specific history entry, so clicking Undo a few
        // seconds later can't reverse something the user did in between.
        toast.info(`Deleted ${count} ${count === 1 ? "image" : "images"}`, {
          label: "Undo",
          run: () => void undo(entryId),
        });
      })
      .catch((err) => setError(String(err)));
  };

  // Render in z-order so reordering is visible.
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.z - b.z),
    [items],
  );

  // Notes render above all items (their zIndex beats the items' auto z), and
  // among themselves by the same zIndex — so they are deliberately rendered in
  // stable array order and NOT sorted by z like items are. Sorting here would
  // reorder the DOM on bringNoteToFront, and moving a node mid-gesture
  // implicitly releases its pointer capture, stranding a drag/resize.

  // Group/ungroup availability for the toolbar. Can group when ≥2 are selected
  // and they aren't already all one existing group; can ungroup when any
  // selected item belongs to a group.
  const { canGroup, canUngroup } = useMemo(() => {
    const sel = items.filter((it) => selectedIds.includes(it.id));
    const groupIds = new Set(sel.map((it) => it.groupId));
    const allOneGroup =
      sel.length >= 2 &&
      groupIds.size === 1 &&
      !groupIds.has(null) &&
      sel.length ===
        items.filter((it) => it.groupId === sel[0].groupId).length;
    return {
      canGroup: sel.length >= 2 && !allOneGroup,
      canUngroup: sel.some((it) => it.groupId),
    };
  }, [items, selectedIds]);

  // Latest viewport in a ref for handlers registered once.
  const viewRef = useRef({ zoom: 1, scroll: { x: 0, y: 0 } });
  viewRef.current = { zoom, scroll };

  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selectedIds;

  // The key handler registers once, so the fit actions reach it through refs
  // written during render (same pattern as viewRef/selectedRef above).
  const zoomToFitRef = useRef<() => void>(() => {});
  const zoomToSelectionRef = useRef<() => void>(() => {});

  // True while we're programmatically restoring a saved viewport; see the
  // restore effect below for why the echoed events must not be persisted.
  const restoringRef = useRef(false);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const { zoom: z, scroll: s } = viewRef.current;
    return { x: s.x + (clientX - left) / z, y: s.y + (clientY - top) / z };
  };

  const viewportCenterWorld = () =>
    screenToWorld(window.innerWidth / 2, window.innerHeight / 2);

  // Zoom by `factor` about a screen point, keeping the world coordinate under
  // that point fixed — solving screenToWorld for the new scroll gives
  // scroll' = scroll + offset * (1/z - 1/z'). Reads the viewport from viewRef so
  // it stays valid inside handlers registered once.
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const viewer = viewerRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!viewer || !rect) return;
      const { zoom: z, scroll: s } = viewRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      if (next === z) return; // already pinned at a zoom limit
      const k = 1 / z - 1 / next;
      const at = {
        x: s.x + (clientX - rect.left) * k,
        y: s.y + (clientY - rect.top) * k,
      };
      // setZoom re-anchors scroll on its own (useAutoZoom); scrollTo right
      // after overrides it with the cursor-anchored position.
      viewer.setZoom(next);
      viewer.scrollTo(at.x, at.y);
      setZoom(next);
      setScroll(at);
      if (!restoringRef.current) setView({ ...at, zoom: next });
    },
    [setView],
  );

  // Hold Space to pan with a left-drag (Figma-style).
  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      !!(el as HTMLElement | null)?.closest?.(
        'input, textarea, [contenteditable="true"]',
      );
    const down = (e: KeyboardEvent) => {
      if (e.shiftKey) setShiftHeld(true);
      if (e.code === "Space" && !isEditable(e.target)) {
        e.preventDefault();
        if (!e.repeat) setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!e.shiftKey) setShiftHeld(false);
      if (e.code === "Space") setSpaceHeld(false);
    };
    const blur = () => {
      setSpaceHeld(false);
      setShiftHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Delete selection; group/ungroup; z-order shortcuts; escape to deselect.
  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      !!(el as HTMLElement | null)?.closest?.(
        'input, textarea, [contenteditable="true"]',
      );
    const onKey = (e: KeyboardEvent) => {
      // isEditable also keeps Ctrl+Z inside a note's textarea on the browser's
      // native text undo instead of reversing a canvas action.
      if (isEditable(e.target)) return;
      // A dialog blocks the canvas behind it: Delete or Ctrl+Z pressed while
      // focus sits on a dialog button must not edit the board underneath.
      // The dialog handles its own Escape.
      if (document.querySelector('[aria-modal="true"]')) return;
      const sel = selectedRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && e.key === "?") {
        e.preventDefault();
        setShortcuts((o) => !o);
      } else if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        void redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        deleteItems(sel);
      } else if (e.key === "Escape") {
        setSelectedIds([]);
      } else if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setSelectedIds(useBoardStore.getState().items.map((it) => it.id));
      } else if (sel.length && !mod && e.key.startsWith("Arrow")) {
        // Keyboard alternative to dragging (WCAG 2.2 dragging movements), and
        // the precise way to line things up. World units, like the snap grid:
        // 1px, or 10px with Shift. A held key or a quick run of presses folds
        // into one undo entry through the merge key.
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const { items: all, patchItems } = useBoardStore.getState();
        const selSet = new Set(sel);
        const updates = all
          .filter((it) => selSet.has(it.id))
          .map((it) => ({ id: it.id, patch: { x: it.x + dx, y: it.y + dy } }));
        const label = `Nudge ${updates.length === 1 ? "image" : `${updates.length} images`}`;
        patchItems(updates, label, `nudge:${[...sel].sort().join(",")}`);
      } else if (mod && (e.key === "g" || e.key === "G")) {
        // Ctrl/Cmd+G groups; add Shift to ungroup.
        e.preventDefault();
        if (e.shiftKey) {
          if (sel.length) void ungroupItems(sel);
        } else if (sel.length >= 2) {
          void groupItems(sel);
        }
      } else if (sel.length && mod && e.key === "]") {
        e.preventDefault();
        bringToFront(sel);
      } else if (sel.length && mod && e.key === "[") {
        e.preventDefault();
        sendToBack(sel);
      } else if (!mod && e.shiftKey && (e.key === "!" || e.code === "Digit1")) {
        // Shift+1 / Shift+2 — the layouts differ on what `key` reports, so
        // match the physical digit too.
        e.preventDefault();
        zoomToFitRef.current();
      } else if (!mod && e.shiftKey && (e.key === "@" || e.code === "Digit2")) {
        e.preventDefault();
        zoomToSelectionRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // deleteItems closes over stable store actions only; selection is read
    // through selectedRef so this handler registers once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeItems, bringToFront, sendToBack, groupItems, ungroupItems, undo, redo]);

  // Middle-drag to pan, the convention in every other canvas tool (Figma, Miro,
  // PureRef). InfiniteViewer's own mouse-drag is bound to Space+left, so this is
  // handled here: track the gesture on window so it survives the cursor leaving
  // the canvas, and suppress the default middle-click autoscroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let start: { cx: number; cy: number; sx: number; sy: number } | null = null;

    const down = (e: MouseEvent) => {
      if (e.button !== 1 || !el.contains(e.target as Node)) return;
      e.preventDefault();
      const { scroll: sc } = viewRef.current;
      start = { cx: e.clientX, cy: e.clientY, sx: sc.x, sy: sc.y };
      setMiddlePanning(true);
    };
    const move = (e: MouseEvent) => {
      if (!start) return;
      const { zoom: z } = viewRef.current;
      const at = {
        x: start.sx - (e.clientX - start.cx) / z,
        y: start.sy - (e.clientY - start.cy) / z,
      };
      viewerRef.current?.scrollTo(at.x, at.y);
      setScroll(at);
      setView({ ...at, zoom: z });
    };
    const up = (e: MouseEvent) => {
      if (e.button !== 1 || !start) return;
      start = null;
      setMiddlePanning(false);
    };
    // Chromium opens its scroll-anchor widget on auxclick; cancel it.
    const aux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    el.addEventListener("auxclick", aux);
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("auxclick", aux);
    };
  }, [setView]);

  // Close the right-click note menu on Escape.
  useEffect(() => {
    if (!noteMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNoteMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [noteMenu]);

  // Load the board on mount.
  useEffect(() => {
    void init();
  }, [init]);

  // Flush pending viewport + note-text writes when the window is closing so the
  // next launch restores the exact last position and note contents.
  useEffect(() => {
    const flush = () => {
      const s = useBoardStore.getState();
      s.flushView();
      s.flushNotes();
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Ctrl+wheel is overloaded: it's WebView2's native page-zoom gesture, it's how
  // Chromium reports a *touchpad pinch*, and it's the plain mouse zoom shortcut.
  // A pinch reaches the page as synthetic ctrl+wheel events *before* WebView2
  // applies its own "Page Scale" zoom, and only turns into Page Scale if the
  // page lets them through. So WebView2's pinch setting must stay ON: with it
  // off, Windows treats the pinch as a two-finger pan and the page only ever
  // sees small horizontal scrolls. Tauri ties that setting to the window's
  // `zoomHotkeysEnabled` (wry sets IsPinchZoomEnabled from it), which is why
  // tauri.conf.json turns it on — and why the browser zoom keys are taken
  // over in the effect below.
  // We take it over entirely — cancel the native zoom, keep it away from
  // InfiniteViewer's own wheel-pinch (hence the capture-phase stopPropagation;
  // its handler sits on the viewer container, and its single wheelScale can't
  // serve both a 100+ mouse notch and a touchpad's stream of small deltas), and
  // apply our own cursor-anchored zoom instead. macOS trackpads don't come
  // through here — WKWebView reports those as gesture events, which the viewer's
  // `useGesture` still handles.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const el = containerRef.current;
      if (!el || !el.contains(e.target as Node)) return;
      // A mouse notch arrives as one big delta (usually a multiple of 100/120,
      // or a line/page unit); a pinch streams many small, often fractional
      // ones. Scaling both the same way makes one of the two unusable.
      const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50;
      const factor = notch
        ? Math.exp(-Math.sign(e.deltaY) * WHEEL_ZOOM_STEP)
        : Math.exp(-e.deltaY * PINCH_ZOOM_RATE);
      zoomAt(e.clientX, e.clientY, factor);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () =>
      window.removeEventListener("wheel", onWheel, { capture: true });
  }, [zoomAt]);

  // `zoomHotkeysEnabled` (needed for trackpad pinch, see above) also arms
  // WebView2's own Ctrl+= / Ctrl+- / Ctrl+0, which would scale the whole window
  // like a browser tab — toolbars included. Cancel them everywhere, even inside
  // a note or a dialog, and zoom the canvas about its centre instead when
  // nothing modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const zoomIn = e.code === "Equal" || e.code === "NumpadAdd";
      const zoomOut = e.code === "Minus" || e.code === "NumpadSubtract";
      const reset = e.code === "Digit0" || e.code === "Numpad0";
      if (!zoomIn && !zoomOut && !reset) return;
      e.preventDefault();
      if (document.querySelector('[aria-modal="true"]')) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (reset) {
        zoomAt(cx, cy, 1 / viewRef.current.zoom);
      } else {
        zoomAt(cx, cy, Math.exp((zoomIn ? 1 : -1) * WHEEL_ZOOM_STEP * 2));
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [zoomAt]);

  // Paste images or image URLs from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (!e.clipboardData) return;
      const dt = e.clipboardData;
      const at = viewportCenterWorld();
      void withIngestFeedback((onProgress) =>
        ingestDataTransfer(dt, at, addItem, onProgress),
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addItem, setError]);

  // Restore the persisted viewport whenever the active board changes (initial
  // load AND tab switches). Deferred to the next frame: InfiniteViewer must
  // finish measuring its container before scrollTo/setZoom take effect,
  // otherwise the restore silently no-ops and the canvas opens at origin.
  const restoredBoardId = useRef<string | null>(null);
  // restoringRef (declared above) is set for the duration of the restore.
  // InfiniteViewer re-emits `scroll` events in response to setZoom/scrollTo (and
  // again a frame later via its own scroll-correction). Those echoes must NOT
  // persist, or they overwrite the saved viewport with the restore's
  // intermediate (wrong-zoom) values — corrupting it for the *next* launch.
  useEffect(() => {
    if (!board || restoredBoardId.current === board.id) return;
    restoredBoardId.current = board.id;
    // Switching boards: drop the old board's selection.
    setSelectedIds([]);
    const { viewZoom, viewX, viewY } = board;
    restoringRef.current = true;
    const raf = requestAnimationFrame(() => {
      const v = viewerRef.current;
      if (v) {
        v.setZoom(viewZoom);
        v.scrollTo(viewX, viewY);
        setZoom(viewZoom);
        setScroll({ x: viewX, y: viewY });
      }
      // Release after the viewer settles: its scroll-correction runs on the
      // following frame, so wait two frames before re-enabling persistence.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          restoringRef.current = false;
        }),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [board]);

  const applyZoom = (next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    viewerRef.current?.setZoom(clamped);
    setZoom(clamped);
    setView({ x: scroll.x, y: scroll.y, zoom: clamped });
  };

  const resetView = () => {
    viewerRef.current?.setZoom(1);
    viewerRef.current?.scrollCenter();
    setZoom(1);
  };

  /**
   * Move the viewport so `box` (world coords) fills it with a margin. Solves the
   * same screenToWorld relation as zoomAt, but for a whole rect: putting the
   * box's centre at the viewport's centre means scroll = centre - half a
   * viewport's worth of world units.
   */
  const fitToBox = (box: Box | null) => {
    const viewer = viewerRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!viewer || !rect || !box) return;
    const next = fitView(box, rect, {
      padding: FIT_PADDING,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    if (!next) return;
    const at = { x: next.x, y: next.y };
    viewer.setZoom(next.zoom);
    viewer.scrollTo(at.x, at.y);
    setZoom(next.zoom);
    setScroll(at);
    setView({ ...at, zoom: next.zoom });
  };

  const zoomToFit = () => fitToBox(boundsOf(items, notes));
  const zoomToSelection = () =>
    fitToBox(boundsOf(items.filter((it) => selectedIds.includes(it.id)), []));
  zoomToFitRef.current = zoomToFit;
  zoomToSelectionRef.current = zoomToSelection;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const at = screenToWorld(e.clientX, e.clientY);
    const dt = e.dataTransfer;
    void withIngestFeedback((onProgress) =>
      ingestDataTransfer(dt, at, addItem, onProgress),
    );
  };

  const onUploadPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const at = viewportCenterWorld();
    void withIngestFeedback((onProgress) =>
      ingestFiles(files, at, addItem, onProgress),
    );
  };

  // shared chrome button styling
  const chip =
    "grid h-8 w-8 place-items-center rounded hover:bg-[var(--surface-hover)]";

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragOver(false);
      }}
      onDrop={onDrop}
      onContextMenu={(e) => {
        // Only offer "Add note here" on empty canvas — not over UI chrome
        // (toolbar, settings, tabs), editable fields, or existing notes.
        const t = e.target as HTMLElement;
        if (
          t.closest?.(
            'input, textarea, [contenteditable="true"], .sticky-note, .ui-chrome',
          )
        )
          return;
        e.preventDefault();
        setNoteMenu({
          screenX: e.clientX,
          screenY: e.clientY,
          world: screenToWorld(e.clientX, e.clientY),
        });
      }}
      className={`relative h-full w-full select-none overflow-hidden bg-[var(--bg)] ${
        middlePanning
          ? "cursor-grabbing"
          : spaceHeld
            ? "cursor-grab active:cursor-grabbing"
            : ""
      }`}
    >
      {/* fixed per-board background image/gif (does not pan/zoom) */}
      <BoardBackground />

      {/* dot grid that tracks the viewport transform */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--grid) 1px, transparent 1px)",
          backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
          backgroundPosition: `${-scroll.x * zoom}px ${-scroll.y * zoom}px`,
        }}
      />

      <InfiniteViewer
        ref={viewerRef}
        className="absolute inset-0 h-full w-full"
        useMouseDrag={spaceHeld}
        useWheelScroll
        // Ctrl+wheel zoom is handled by our own wheel listener (see above), so
        // the viewer's wheel-pinch stays off — with it on, both would fire.
        useWheelPinch={false}
        useAutoZoom
        // Safari/WKWebView trackpad pinch arrives as gesture events, not
        // ctrl+wheel; the viewer handles those.
        useGesture
        zoomRange={[MIN_ZOOM, MAX_ZOOM]}
        onScroll={(e) => {
          setScroll({ x: e.scrollLeft, y: e.scrollTop });
          if (restoringRef.current) return;
          // Read the zoom from the viewer, not the render closure: a scroll
          // event can be emitted by a zoom change (the viewer scrolls to keep
          // the pinch centre), and the closure's `zoom` lags a render behind.
          const z = viewerRef.current?.getZoom() ?? zoom;
          setView({ x: e.scrollLeft, y: e.scrollTop, zoom: z });
        }}
        onPinch={(e) => {
          const x = viewerRef.current?.getScrollLeft() ?? scroll.x;
          const y = viewerRef.current?.getScrollTop() ?? scroll.y;
          setZoom(e.zoom);
          setScroll({ x, y });
          if (restoringRef.current) return;
          setView({ x, y, zoom: e.zoom });
        }}
      >
        <div ref={worldRef} className="relative">
          {ordered.map((item) => (
            <ItemView
              key={item.id}
              item={item}
              selected={selectedIds.includes(item.id)}
            />
          ))}
          {notes.map((note) => (
            <NoteView key={note.id} note={note} zoom={zoom} />
          ))}
        </div>
      </InfiniteViewer>

      {/* selection + manipulation (rendered in screen space, outside the
          scaled viewport, so moveable's control box aligns correctly) */}
      {mounted && (
        <SelectionLayer
          worldEl={worldRef.current}
          containerEl={containerRef.current}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          panMode={spaceHeld}
          freeRatio={shiftHeld}
          viewport={{ x: scroll.x, y: scroll.y, zoom }}
        />
      )}

      {/* first-run / empty-board guidance. Pointer-transparent so it never
          intercepts a drop, and hidden while the drop overlay is showing. */}
      {!loading && items.length === 0 && notes.length === 0 && !dragOver && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="chrome flex flex-col items-center gap-3 px-8 py-7 text-center">
            <ImagePlus
              size={40}
              className="text-[var(--text-dim)] opacity-40"
              strokeWidth={1.25}
            />
            <p className="text-sm text-[var(--text)]">This board is empty</p>
            <p className="max-w-xs text-xs leading-relaxed text-[var(--text-dim)]">
              Drop images or image links anywhere, paste with{" "}
              <Kbd>Ctrl</Kbd>
              <Kbd>V</Kbd>, or use <span className="text-[var(--text)]">Upload
              images</span> above.
            </p>
            <p className="text-[11px] text-[var(--text-dim)] opacity-70">
              <Kbd>Space</Kbd>+drag to pan · <Kbd>Ctrl</Kbd>+scroll to zoom ·
              right-click for a note
            </p>
            <p className="text-[11px] text-[var(--text-dim)] opacity-70">
              Press <Kbd>?</Kbd> for all shortcuts
            </p>
          </div>
        </div>
      )}

      {/* drop overlay */}
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed bg-[var(--accent)]/10"
          style={{ borderColor: "var(--accent)" }}
        >
          <span className="chrome-solid px-4 py-2 text-sm text-[var(--text)]">
            Drop images or image links
          </span>
        </div>
      )}

      {/* toolbar */}
      <div className="ui-chrome absolute left-4 top-4 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
        {/* board switcher */}
        <BoardTabs />
        <button
          data-tour="upload"
          className="chrome flex h-10 items-center gap-1.5 px-3 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={14} />
          Upload images
        </button>
        <div
          data-tour="undo"
          className="chrome flex h-10 items-center gap-1 px-1 text-[var(--text)]"
        >
          <button
            className={`${chip} disabled:opacity-30 disabled:hover:bg-transparent`}
            onClick={() => void undo()}
            disabled={!undoLabel}
            aria-label={undoLabel ? `Undo ${undoLabel}` : "Nothing to undo"}
            title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}
          >
            <Undo2 size={16} />
          </button>
          <button
            className={`${chip} disabled:opacity-30 disabled:hover:bg-transparent`}
            onClick={() => void redo()}
            disabled={!redoLabel}
            aria-label={redoLabel ? `Redo ${redoLabel}` : "Nothing to redo"}
            title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo"}
          >
            <Redo2 size={16} />
          </button>
        </div>
        {selectedIds.length > 0 && (
          <div className="chrome flex h-10 items-center gap-1 px-1 text-[var(--text)]">
            <button
              className={chip}
              onClick={() => bringToFront(selectedIds)}
              aria-label="Bring to front"
              title="Bring to front (Ctrl+])"
            >
              <BringToFront size={16} />
            </button>
            <button
              className={chip}
              onClick={() => sendToBack(selectedIds)}
              aria-label="Send to back"
              title="Send to back (Ctrl+[)"
            >
              <SendToBack size={16} />
            </button>
            {canGroup && (
              <button
                className={chip}
                onClick={() => void groupItems(selectedIds)}
                aria-label="Group selection"
                title="Group (Ctrl+G)"
              >
                <GroupIcon size={16} />
              </button>
            )}
            {canUngroup && (
              <button
                className={chip}
                onClick={() => void ungroupItems(selectedIds)}
                aria-label="Ungroup selection"
                title="Ungroup (Ctrl+Shift+G)"
              >
                <Ungroup size={16} />
              </button>
            )}
            <button
              className="grid h-8 w-8 place-items-center rounded text-red-400 hover:bg-red-500/20"
              onClick={() => deleteItems(selectedIds)}
              aria-label="Delete selection"
              title="Delete (Del)"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <span className="chrome ui-mono flex h-10 select-none items-center px-2.5 text-[11px] text-[var(--text-dim)]">
          {loading
            ? "loading…"
            : `${items.length} items${
                selectedIds.length ? ` · ${selectedIds.length} selected` : ""
              }`}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onUploadPick}
        />
      </div>

      {/* zoom controls */}
      <div
        data-tour="zoom"
        className="chrome ui-chrome absolute bottom-4 right-4 flex items-center gap-1 p-1 text-[var(--text)]"
      >
        <button
          className={chip}
          onClick={() => applyZoom(zoom / 1.2)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={16} />
        </button>
        <div className="relative">
          <button
            className="ui-mono h-8 min-w-16 rounded-[3px] px-2 text-xs tabular-nums hover:bg-[var(--surface-hover)]"
            onClick={() => setZoomMenu((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={zoomMenu}
            aria-label={`Zoom ${Math.round(zoom * 100)} percent — change`}
            title="Zoom options"
          >
            {Math.round(zoom * 100)}%
          </button>
          {zoomMenu && (
            <>
              <div className="fixed inset-0 z-40" onPointerDown={() => setZoomMenu(false)} />
              <div
                ref={zoomMenuRef}
                role="menu"
                aria-label="Zoom options"
                className="chrome-solid absolute bottom-10 right-0 z-50 w-52 overflow-hidden py-1 text-xs"
              >
                {[
                  { label: "Zoom to fit", hint: "Shift+1", run: zoomToFit },
                  {
                    label: "Zoom to selection",
                    hint: "Shift+2",
                    run: zoomToSelection,
                    disabled: selectedIds.length === 0,
                  },
                  { label: "Reset to 100%", hint: "", run: resetView },
                  { label: "50%", hint: "", run: () => applyZoom(0.5) },
                  { label: "200%", hint: "", run: () => applyZoom(2) },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    role="menuitem"
                    disabled={opt.disabled}
                    className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
                    onClick={() => {
                      opt.run();
                      setZoomMenu(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="ui-mono text-[var(--text-dim)]">{opt.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          className={chip}
          onClick={zoomToFit}
          aria-label="Zoom to fit"
          title="Zoom to fit (Shift+1)"
        >
          <Maximize size={15} />
        </button>
        <button
          className={chip}
          onClick={() => applyZoom(zoom * 1.2)}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={16} />
        </button>
      </div>

      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}

      {/* right-click "Add note here" menu */}
      {noteMenu && (
        <>
          {/* full-screen catcher: any click/right-click elsewhere dismisses */}
          <div
            className="fixed inset-0 z-40"
            onPointerDown={() => setNoteMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setNoteMenu(null);
            }}
          />
          <div
            className="chrome-solid ui-chrome fixed z-50 overflow-hidden py-1 text-xs text-[var(--text)]"
            style={{ left: noteMenu.screenX, top: noteMenu.screenY }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--surface-hover)]"
              onClick={() => {
                void addNote(noteMenu.world);
                setNoteMenu(null);
              }}
            >
              <StickyNote size={13} />
              Add note here
            </button>
          </div>
        </>
      )}

    </div>
  );
}
