import { useEffect, useMemo, useRef, useState } from "react";
import InfiniteViewer from "react-infinite-viewer";
import { useBoardStore } from "../store/boardStore";
import { ingestDataTransfer, ingestFiles } from "../lib/ingest";
import { ItemView } from "./ItemView";
import { SelectionLayer } from "./SelectionLayer";

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

  // Delete selection; z-order shortcuts; escape to deselect.
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
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        requestDelete(sel);
      } else if (e.key === "Escape") {
        setSelectedIds([]);
      } else if (sel.length && (e.ctrlKey || e.metaKey) && e.key === "]") {
        e.preventDefault();
        bringToFront(sel);
      } else if (sel.length && (e.ctrlKey || e.metaKey) && e.key === "[") {
        e.preventDefault();
        sendToBack(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeItems, bringToFront, sendToBack]);

  // Load the board on mount.
  useEffect(() => {
    void init();
  }, [init]);

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

  // Restore the persisted viewport once the board is loaded.
  const restored = useRef(false);
  useEffect(() => {
    if (!board || restored.current) return;
    restored.current = true;
    const v = viewerRef.current;
    if (!v) return;
    v.setZoom(board.viewZoom);
    v.scrollTo(board.viewX, board.viewY);
    setZoom(board.viewZoom);
    setScroll({ x: board.viewX, y: board.viewY });
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
      className={`relative h-screen w-screen select-none overflow-hidden bg-neutral-900 ${
        spaceHeld ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {/* dot grid that tracks the viewport transform */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)",
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
        wheelPinchKey="ctrl"
        maxPinchWheel={1}
        zoomRange={[MIN_ZOOM, MAX_ZOOM]}
        onScroll={(e) => {
          setScroll({ x: e.scrollLeft, y: e.scrollTop });
          setView({ x: e.scrollLeft, y: e.scrollTop, zoom });
        }}
        onPinch={(e) => {
          const x = viewerRef.current?.getScrollLeft() ?? scroll.x;
          const y = viewerRef.current?.getScrollTop() ?? scroll.y;
          setZoom(e.zoom);
          setScroll({ x, y });
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
        <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-400/10">
          <span className="rounded-lg bg-neutral-900/80 px-4 py-2 text-sm text-sky-200">
            Drop images or image links
          </span>
        </div>
      )}

      {/* toolbar */}
      <div className="ui-chrome absolute left-4 top-4 flex items-center gap-2">
        <button
          className="rounded-lg bg-neutral-800/90 px-3 py-1.5 text-xs text-neutral-100 shadow-lg ring-1 ring-white/10 hover:bg-neutral-700"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload images
        </button>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg bg-neutral-800/90 p-1 text-xs text-neutral-100 shadow-lg ring-1 ring-white/10">
            <button
              className="rounded px-2 py-1 hover:bg-white/10"
              onClick={() => bringToFront(selectedIds)}
              title="Bring to front (Ctrl+])"
            >
              Front
            </button>
            <button
              className="rounded px-2 py-1 hover:bg-white/10"
              onClick={() => sendToBack(selectedIds)}
              title="Send to back (Ctrl+[)"
            >
              Back
            </button>
            <button
              className="rounded px-2 py-1 text-red-300 hover:bg-red-500/20"
              onClick={() => requestDelete(selectedIds)}
              title="Delete (Del)"
            >
              Delete
            </button>
          </div>
        )}
        <span className="select-none text-xs text-neutral-500">
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
      <div className="ui-chrome absolute bottom-4 right-4 flex items-center gap-1 rounded-lg bg-neutral-800/90 p-1 text-neutral-200 shadow-lg ring-1 ring-white/10 backdrop-blur">
        <button
          className="h-8 w-8 rounded text-lg leading-none hover:bg-white/10"
          onClick={() => applyZoom(zoom / 1.2)}
          title="Zoom out"
        >
          −
        </button>
        <button
          className="h-8 min-w-16 rounded px-2 text-xs tabular-nums hover:bg-white/10"
          onClick={resetView}
          title="Reset view"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="h-8 w-8 rounded text-lg leading-none hover:bg-white/10"
          onClick={() => applyZoom(zoom * 1.2)}
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* delete confirmation */}
      {pendingDelete && (
        <div className="ui-chrome absolute inset-0 z-20 grid place-items-center bg-black/50">
          <div className="w-80 rounded-xl bg-neutral-800 p-5 text-neutral-100 shadow-2xl ring-1 ring-white/10">
            <h2 className="text-sm font-semibold">
              Delete {pendingDelete.length}{" "}
              {pendingDelete.length === 1 ? "image" : "images"}?
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              This can't be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                autoFocus
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
