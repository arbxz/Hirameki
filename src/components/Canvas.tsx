import { useEffect, useMemo, useRef, useState } from "react";
import InfiniteViewer from "react-infinite-viewer";
import {
  BringToFront,
  Group as GroupIcon,
  ImagePlus,
  Minus,
  Plus,
  SendToBack,
  Trash2,
  Ungroup,
} from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { ingestDataTransfer, ingestFiles } from "../lib/ingest";
import { ItemView } from "./ItemView";
import { SelectionLayer } from "./SelectionLayer";
import { BoardBackground } from "./BoardBackground";
import { BoardTabs } from "./BoardTabs";
import { ConfirmModal } from "./Modal";

// Phase 4: items can be selected (click / shift-click / marquee), then dragged,
// resized, rotated, reordered, and deleted. Navigation (Space-pan, Ctrl-zoom)
// and ingestion (drop / paste / upload) from earlier phases are unchanged.

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const GRID = 40;

export function Canvas() {
  const viewerRef = useRef<InfiniteViewer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const board = useBoardStore((s) => s.board);
  const items = useBoardStore((s) => s.items);
  const loading = useBoardStore((s) => s.loading);
  const init = useBoardStore((s) => s.init);
  const setView = useBoardStore((s) => s.setView);
  const addItem = useBoardStore((s) => s.addItem);
  const setError = useBoardStore((s) => s.setError);
  const removeItems = useBoardStore((s) => s.removeItems);
  const bringToFront = useBoardStore((s) => s.bringToFront);
  const sendToBack = useBoardStore((s) => s.sendToBack);
  const groupItems = useBoardStore((s) => s.groupItems);
  const ungroupItems = useBoardStore((s) => s.ungroupItems);

  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Holds the ids awaiting delete confirmation (null = no prompt open).
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  // Refs are null on first render; flip after mount so SelectionLayer re-renders
  // once the container/world elements actually exist.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Open the delete confirmation for the given ids (no-op if empty).
  const requestDelete = (ids: string[]) => {
    if (ids.length) setPendingDelete(ids);
  };

  const confirmDelete = () => {
    const ids = pendingDelete;
    setPendingDelete(null);
    if (!ids?.length) return;
    void removeItems(ids).catch((err) => setError(String(err)));
    setSelectedIds([]);
  };

  // Render in z-order so reordering is visible.
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.z - b.z),
    [items],
  );

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

  const pendingDeleteRef = useRef<string[] | null>(null);
  pendingDeleteRef.current = pendingDelete;

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const { zoom: z, scroll: s } = viewRef.current;
    return { x: s.x + (clientX - left) / z, y: s.y + (clientY - top) / z };
  };

  const viewportCenterWorld = () =>
    screenToWorld(window.innerWidth / 2, window.innerHeight / 2);

  // Hold Space to pan with a left-drag (Figma-style).
  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      !!(el as HTMLElement | null)?.closest?.(
        'input, textarea, [contenteditable="true"]',
      );
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isEditable(e.target)) {
        e.preventDefault();
        if (!e.repeat) setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
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
      if (isEditable(e.target)) return;
      // While the confirm prompt is open, only Escape (cancel) is meaningful.
      if (pendingDeleteRef.current) {
        if (e.key === "Escape") setPendingDelete(null);
        return;
      }
      const sel = selectedRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        requestDelete(sel);
      } else if (e.key === "Escape") {
        setSelectedIds([]);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeItems, bringToFront, sendToBack, groupItems, ungroupItems]);

  // Load the board on mount.
  useEffect(() => {
    void init();
  }, [init]);

  // Flush the pending viewport write when the window is closing so the next
  // launch restores the exact last position.
  useEffect(() => {
    const flush = useBoardStore.getState().flushView;
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // WebView2 hijacks Ctrl+wheel for native page zoom; cancel it.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Paste images or image URLs from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (!e.clipboardData) return;
      void ingestDataTransfer(
        e.clipboardData,
        viewportCenterWorld(),
        addItem,
      ).catch((err) => setError(String(err)));
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
  // True while we're programmatically restoring. InfiniteViewer re-emits `scroll`
  // events in response to setZoom/scrollTo (and again a frame later via its own
  // scroll-correction). Those echoes must NOT persist, or they overwrite the
  // saved viewport with the restore's intermediate (wrong-zoom) values — which
  // corrupts the stored position on the *next* launch.
  const restoringRef = useRef(false);
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const at = screenToWorld(e.clientX, e.clientY);
    void ingestDataTransfer(e.dataTransfer, at, addItem).catch((err) =>
      setError(String(err)),
    );
  };

  const onUploadPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    void ingestFiles(files, viewportCenterWorld(), addItem).catch((err) =>
      setError(String(err)),
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
      className={`relative h-screen w-screen select-none overflow-hidden bg-[var(--bg)] ${
        spaceHeld ? "cursor-grab active:cursor-grabbing" : ""
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
        useWheelPinch
        useAutoZoom
        useGesture
        wheelPinchKey="ctrl"
        wheelScale={0.035}
        maxPinchWheel={3}
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
          viewport={{ x: scroll.x, y: scroll.y, zoom }}
        />
      )}

      {/* drop overlay */}
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed bg-[var(--accent)]/10"
          style={{ borderColor: "var(--accent)" }}
        >
          <span className="rounded-lg bg-[var(--surface-solid)] px-4 py-2 text-sm text-[var(--text)]">
            Drop images or image links
          </span>
        </div>
      )}

      {/* toolbar */}
      <div className="ui-chrome absolute left-4 top-4 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
        {/* board switcher */}
        <BoardTabs />
        <button
          className="flex h-10 items-center gap-1.5 rounded-lg bg-[var(--surface)] px-3 text-xs text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur hover:bg-[var(--surface-hover)]"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={14} />
          Upload images
        </button>
        {selectedIds.length > 0 && (
          <div className="flex h-10 items-center gap-1 rounded-lg bg-[var(--surface)] px-1 text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur">
            <button
              className={chip}
              onClick={() => bringToFront(selectedIds)}
              title="Bring to front (Ctrl+])"
            >
              <BringToFront size={16} />
            </button>
            <button
              className={chip}
              onClick={() => sendToBack(selectedIds)}
              title="Send to back (Ctrl+[)"
            >
              <SendToBack size={16} />
            </button>
            {canGroup && (
              <button
                className={chip}
                onClick={() => void groupItems(selectedIds)}
                title="Group (Ctrl+G)"
              >
                <GroupIcon size={16} />
              </button>
            )}
            {canUngroup && (
              <button
                className={chip}
                onClick={() => void ungroupItems(selectedIds)}
                title="Ungroup (Ctrl+Shift+G)"
              >
                <Ungroup size={16} />
              </button>
            )}
            <button
              className="grid h-8 w-8 place-items-center rounded text-red-400 hover:bg-red-500/20"
              onClick={() => requestDelete(selectedIds)}
              title="Delete (Del)"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <span className="flex h-10 select-none items-center px-1 text-xs text-[var(--text-dim)]">
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
      <div className="ui-chrome absolute bottom-4 right-4 flex items-center gap-1 rounded-lg bg-[var(--surface)] p-1 text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur">
        <button className={chip} onClick={() => applyZoom(zoom / 1.2)} title="Zoom out">
          <Minus size={16} />
        </button>
        <button
          className="h-8 min-w-16 rounded px-2 text-xs tabular-nums hover:bg-[var(--surface-hover)]"
          onClick={resetView}
          title="Reset view"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className={chip} onClick={() => applyZoom(zoom * 1.2)} title="Zoom in">
          <Plus size={16} />
        </button>
      </div>

      {/* delete confirmation */}
      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${pendingDelete.length} ${
            pendingDelete.length === 1 ? "image" : "images"
          }?`}
          message="This can't be undone."
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
