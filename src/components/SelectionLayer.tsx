import { useEffect, useMemo, useRef } from "react";
import Moveable from "react-moveable";
import Selecto from "react-selecto";
import type {
  OnDrag,
  OnDragGroup,
  OnResize,
  OnResizeGroup,
  OnRotate,
  OnRotateGroup,
} from "react-moveable";
import { useBoardStore } from "../store/boardStore";
import { itemTransform } from "./itemTransform";

// Phase 4 manipulation layer. react-selecto handles click + marquee selection;
// react-moveable handles drag / resize / rotate for one or many targets.
//
// Strategy: during a gesture we mutate each DOM element's transform/size
// directly (no React re-render per frame) while tracking new geometry in a live
// ref, then commit everything to the store (and SQLite) once on gesture end.
// Every handler derives the new geometry from the gesture-start snapshot plus
// moveable's absolute values, so there's no incremental drift.

interface Geom {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export function SelectionLayer({
  worldEl,
  containerEl,
  selectedIds,
  setSelectedIds,
  panMode,
  freeRatio,
  viewport,
}: {
  worldEl: HTMLElement | null;
  containerEl: HTMLElement | null;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  panMode: boolean;
  /** Shift is held: allow a resize to distort the image. */
  freeRatio: boolean;
  /** Scroll/zoom — changes re-anchor the control box to its target. */
  viewport: { x: number; y: number; zoom: number };
}) {
  const items = useBoardStore((s) => s.items);
  const patchItems = useBoardStore((s) => s.patchItems);
  const expandSelection = useBoardStore((s) => s.expandSelection);
  const moveableRef = useRef<Moveable>(null);

  // Snapshot of geometry at gesture start, and the live working copy.
  const startRef = useRef<Map<string, Geom>>(new Map());
  const liveRef = useRef<Map<string, Geom>>(new Map());

  // Resolve selected ids to their live DOM nodes for moveable's target.
  const targets = useMemo(() => {
    if (!worldEl) return [];
    return selectedIds
      .map((id) => worldEl.querySelector<HTMLElement>(`[data-item-id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null);
    // `items` isn't read here, but its nodes re-render when it changes, so the
    // query has to run again to pick up the new elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEl, selectedIds, items]);

  // Every other item on the board is a snap reference. Deliberately keyed on
  // items.length, not items: the node list only changes when items are added or
  // removed, while `items` changes on every geometry commit — rebuilding this
  // array on each drag would hand Moveable a new prop identity every time.
  const elementGuidelines = useMemo(() => {
    if (!worldEl) return [];
    const selected = new Set(selectedIds);
    return [...worldEl.querySelectorAll<HTMLElement>("[data-item-id]")].filter(
      (el) => !selected.has(el.getAttribute("data-item-id") ?? ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEl, selectedIds, items.length]);

  // Keep moveable's box aligned when items change, or when the viewport
  // pans/zooms (otherwise the control box stays fixed in screen space while the
  // target scrolls away beneath it).
  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [items, targets, viewport.x, viewport.y, viewport.zoom]);

  // Double-click a grouped image to select its whole group (single click keeps
  // selecting just one image).
  useEffect(() => {
    if (!worldEl) return;
    const onDblClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-item-id]",
      );
      const id = el?.getAttribute("data-item-id");
      if (!id) return;
      const expanded = expandSelection([id]);
      if (expanded.length > 1) setSelectedIds(expanded);
    };
    worldEl.addEventListener("dblclick", onDblClick);
    return () => worldEl.removeEventListener("dblclick", onDblClick);
  }, [worldEl, expandSelection, setSelectedIds]);

  const snapshot = () => {
    startRef.current.clear();
    liveRef.current.clear();
    for (const id of selectedIds) {
      const it = items.find((i) => i.id === id);
      if (it) {
        startRef.current.set(id, {
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
          rotation: it.rotation,
        });
      }
    }
  };

  const apply = (target: HTMLElement, g: Geom) => {
    target.style.width = `${g.width}px`;
    target.style.height = `${g.height}px`;
    target.style.transform = itemTransform(g.x, g.y, g.rotation);
  };

  const commit = () => {
    const updates = [...liveRef.current.entries()].map(([id, g]) => ({
      id,
      patch: {
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        rotation: g.rotation,
      },
    }));
    if (updates.length) patchItems(updates);
    startRef.current.clear();
    liveRef.current.clear();
  };

  const startOf = (target: HTMLElement): { id: string; g: Geom } | null => {
    const id = target.getAttribute("data-item-id");
    const g = id ? startRef.current.get(id) : undefined;
    return id && g ? { id, g } : null;
  };

  // ---- single-target handlers (also reused for each group sub-event) ----

  // NOTE: moveable's `beforeTranslate` is absolute — it already folds in the
  // element's starting translate(x,y). So we assign it directly, never add it to
  // the start snapshot (doing so double-counts the position). The snapshot only
  // supplies fields a given gesture doesn't report (e.g. rotation during drag).

  const onDrag = (e: OnDrag) => {
    const s = startOf(e.target as HTMLElement);
    if (!s) return;
    const g: Geom = {
      ...s.g,
      x: e.beforeTranslate[0],
      y: e.beforeTranslate[1],
    };
    liveRef.current.set(s.id, g);
    apply(e.target as HTMLElement, g);
  };

  const onResize = (e: OnResize) => {
    const s = startOf(e.target as HTMLElement);
    if (!s) return;
    const t = e.drag.beforeTranslate;
    const g: Geom = {
      ...s.g,
      width: e.width,
      height: e.height,
      x: t[0],
      y: t[1],
    };
    liveRef.current.set(s.id, g);
    apply(e.target as HTMLElement, g);
  };

  const onRotate = (e: OnRotate) => {
    const s = startOf(e.target as HTMLElement);
    if (!s) return;
    const t = e.drag.beforeTranslate;
    const g: Geom = {
      ...s.g,
      rotation: e.rotation,
      x: t[0],
      y: t[1],
    };
    liveRef.current.set(s.id, g);
    apply(e.target as HTMLElement, g);
  };

  // ---- group handlers ----

  const onDragGroup = (e: OnDragGroup) => e.events.forEach(onDrag);
  const onResizeGroup = (e: OnResizeGroup) => e.events.forEach(onResize);
  const onRotateGroup = (e: OnRotateGroup) => e.events.forEach(onRotate);

  if (!containerEl) return null;

  return (
    <>
      <Moveable
        ref={moveableRef}
        target={targets}
        draggable={!panMode}
        resizable={!panMode}
        // Images render with object-fit: cover, so an off-ratio resize doesn't
        // stretch the picture — it silently crops it, with no way to tell what
        // was lost. Lock the ratio by default; Shift frees it deliberately.
        keepRatio={!freeRatio}
        rotatable={!panMode}
        origin={false}
        throttleDrag={0}
        throttleResize={0}
        // Shift-snap rotation to 15° increments; free otherwise.
        throttleRotate={freeRatio ? 15 : 0}
        // Align to neighbouring images' edges and centres. This is what makes a
        // hand-arranged board read as deliberate rather than approximate.
        snappable
        elementGuidelines={elementGuidelines}
        snapDirections={{
          top: true,
          left: true,
          bottom: true,
          right: true,
          center: true,
          middle: true,
        }}
        elementSnapDirections={{
          top: true,
          left: true,
          bottom: true,
          right: true,
          center: true,
          middle: true,
        }}
        snapThreshold={6}
        snapGap={false}
        isDisplaySnapDigit={false}
        onDragStart={snapshot}
        onDrag={onDrag}
        onDragEnd={commit}
        onResizeStart={snapshot}
        onResize={onResize}
        onResizeEnd={commit}
        onRotateStart={snapshot}
        onRotate={onRotate}
        onRotateEnd={commit}
        onDragGroupStart={snapshot}
        onDragGroup={onDragGroup}
        onDragGroupEnd={commit}
        onResizeGroupStart={snapshot}
        onResizeGroup={onResizeGroup}
        onResizeGroupEnd={commit}
        onRotateGroupStart={snapshot}
        onRotateGroup={onRotateGroup}
        onRotateGroupEnd={commit}
      />
      <Selecto
        dragContainer={containerEl}
        selectableTargets={[".board-item"]}
        hitRate={0}
        selectByClick
        selectFromInside={false}
        toggleContinueSelect={["shift"]}
        // Don't start a marquee/click-select while panning, when the gesture
        // begins on the moveable control box (so dragging a selected item moves
        // it), or when it begins on UI chrome (toolbar, modals) — otherwise
        // Selecto swallows those clicks and the buttons never fire.
        dragCondition={(e) => {
          if (panMode) return false;
          const t = (e.inputEvent?.target as HTMLElement) ?? null;
          if (t?.closest?.(".moveable-control-box")) return false;
          if (t?.closest?.(".ui-chrome")) return false;
          // Notes have their own drag/resize; don't start a marquee on them.
          if (t?.closest?.(".sticky-note")) return false;
          return true;
        }}
        onSelect={(e) => {
          const ids = e.selected
            .map((el) => el.getAttribute("data-item-id"))
            .filter((v): v is string => !!v);
          // A marquee drag has a non-zero selection rect; a plain click is a
          // ~zero-area rect. Drags pull in every member of any group they touch
          // (so you can grab a whole group by lassoing part of it); a click
          // selects just the one image. Double-click-to-select-group is handled
          // separately below.
          const isMarquee = e.rect.width > 2 || e.rect.height > 2;
          setSelectedIds(isMarquee ? expandSelection(ids) : ids);
        }}
      />
    </>
  );
}
