import { useRef, useState } from "react";
import { Palette, Sparkles, Trash2 } from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import {
  NOTE_COLOR_KEYS,
  NOTE_PALETTE,
  noteStyle,
  stepFontSize,
  type Note,
  type NoteColorKey,
} from "../lib/notes";

// A single sticky note on the canvas. Rendered inside the (zoomed) world layer,
// so it uses the same translate-at-origin transform model as ItemView. Drag (by
// the header) and resize (by the corner) are handled with native pointer events;
// screen deltas convert to world units by dividing by the current zoom. Geometry
// is kept locally during a gesture and committed to the store once on pointer-up.
//
// Gestures rely on pointer capture on the root, which the browser releases if the
// element is moved in the DOM — so Canvas must keep notes in stable array order
// (they stack via zIndex, not DOM order). endGesture is also wired to
// lostpointercapture, and a move with no button held ends the gesture, so a lost
// capture can't strand a drag/resize that then follows the cursor unheld.
//
// Zoom legibility: the body text scales literally with the canvas (size is set
// manually via the A-/A+ stepper — no auto floor). Only the header chrome + resize
// handle get a mild counter-scale (sqrt-dampened, clamped) so they shrink less
// aggressively when zoomed out.

const MIN_W = 140;
const MIN_H = 120;
// Cap on the chrome counter-scale so it never balloons at extreme zoom-out.
const MAX_CHROME_SCALE = 2.5;

interface Gesture {
  kind: "drag" | "resize";
  cx: number; // pointer client x/y at gesture start
  cy: number;
  x: number; // note geometry at gesture start
  y: number;
  w: number;
  h: number;
  zoom: number; // canvas zoom at gesture start
}

export function NoteView({ note, zoom }: { note: Note; zoom: number }) {
  const patchNoteText = useBoardStore((s) => s.patchNoteText);
  const commitNoteGeom = useBoardStore((s) => s.commitNoteGeom);
  const setNoteStyle = useBoardStore((s) => s.setNoteStyle);
  const removeNote = useBoardStore((s) => s.removeNote);
  const bringNoteToFront = useBoardStore((s) => s.bringNoteToFront);

  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Live geometry while dragging/resizing; null means "use the note's values".
  const [live, setLive] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const x = live?.x ?? note.x;
  const y = live?.y ?? note.y;
  const width = live?.width ?? note.width;
  const height = live?.height ?? note.height;

  // Chrome (header + handle): mild counter-scale below 1x (sqrt-dampened), so it
  // still shrinks with zoom but less than the note itself. No effect at >=1x.
  const cs =
    zoom < 1 ? Math.min(MAX_CHROME_SCALE, Math.sqrt(1 / zoom)) : 1;
  const headerH = 28 * cs;
  const iconPx = Math.round(13 * cs);
  const btnBox = { height: 24 * cs, width: 24 * cs };
  const handlePx = 16 * cs;

  const geomFrom = (g: Gesture, clientX: number, clientY: number) => {
    // Convert with the zoom captured at pointer-down, not the live one: the
    // delta is measured from the gesture's anchor, so zooming mid-gesture would
    // re-scale the whole accumulated delta at once and make the note jump.
    const dx = (clientX - g.cx) / g.zoom;
    const dy = (clientY - g.cy) / g.zoom;
    return g.kind === "drag"
      ? { x: g.x + dx, y: g.y + dy, width: g.w, height: g.h }
      : {
          x: g.x,
          y: g.y,
          width: Math.max(MIN_W, g.w + dx),
          height: Math.max(MIN_H, g.h + dy),
        };
  };

  const startGesture =
    (kind: "drag" | "resize") => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      bringNoteToFront(note.id);
      gestureRef.current = {
        kind,
        cx: e.clientX,
        cy: e.clientY,
        x: note.x,
        y: note.y,
        w: note.width,
        h: note.height,
        zoom,
      };
      rootRef.current?.setPointerCapture(e.pointerId);
    };

  const endGesture = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    if (rootRef.current?.hasPointerCapture(e.pointerId)) {
      rootRef.current.releasePointerCapture(e.pointerId);
    }
    commitNoteGeom(note.id, geomFrom(g, e.clientX, e.clientY));
    setLive(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    // Self-heal: without pointer capture the pointerup can land on another
    // element, leaving the gesture open. A move with no button held means the
    // release already happened, so end it here rather than track the hover.
    if (e.buttons === 0) {
      endGesture(e);
      return;
    }
    setLive(geomFrom(g, e.clientX, e.clientY));
  };

  const pickColor = (color: NoteColorKey | null) => {
    setNoteStyle(note.id, { color });
    setPaletteOpen(false);
  };

  const changeFont = (dir: 1 | -1) =>
    setNoteStyle(note.id, { fontSize: stepFontSize(note.fontSize, dir) });

  const iconBtn =
    "grid place-items-center rounded opacity-60 hover:opacity-100 hover:bg-black/10";

  return (
    <div
      ref={rootRef}
      data-note-id={note.id}
      className="sticky-note absolute left-0 top-0 flex flex-col overflow-hidden rounded-2xl shadow-lg"
      style={{
        width,
        height,
        transform: `translate(${x}px, ${y}px)`,
        transformOrigin: "0 0",
        zIndex: 1 + note.z,
        ...noteStyle(note.color, note.glass),
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
    >
      {/* header / drag handle */}
      <div
        className="flex shrink-0 cursor-move items-center justify-between"
        style={{
          height: headerH,
          paddingLeft: 6 * cs,
          paddingRight: 6 * cs,
          touchAction: "none",
        }}
        onPointerDown={startGesture("drag")}
      >
        {/* font size stepper */}
        <div
          className="flex items-center"
          style={{ gap: 2 * cs }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className={iconBtn}
            style={btnBox}
            aria-label="Smaller text"
            title="Smaller text"
            onClick={() => changeFont(-1)}
          >
            <span style={{ fontSize: Math.round(10 * cs), fontWeight: 700 }}>
              A
            </span>
          </button>
          <button
            className={iconBtn}
            style={btnBox}
            aria-label="Larger text"
            title="Larger text"
            onClick={() => changeFont(1)}
          >
            <span style={{ fontSize: Math.round(15 * cs), fontWeight: 700 }}>
              A
            </span>
          </button>
        </div>

        {/* color / glass / delete */}
        <div
          className="flex items-center"
          style={{ gap: 2 * cs }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className={iconBtn}
            style={btnBox}
            aria-label="Note colour"
            aria-expanded={paletteOpen}
            title="Color"
            onClick={() => setPaletteOpen((o) => !o)}
          >
            <Palette size={iconPx} />
          </button>
          <button
            className={iconBtn}
            style={{ ...btnBox, opacity: note.glass ? 1 : undefined }}
            aria-label={note.glass ? "Solid background" : "Glass background"}
            aria-pressed={note.glass}
            title={note.glass ? "Solid background" : "Glass background"}
            onClick={() => setNoteStyle(note.id, { glass: !note.glass })}
          >
            <Sparkles size={iconPx} />
          </button>
          <button
            className={iconBtn}
            style={btnBox}
            aria-label="Delete note"
            title="Delete note"
            onClick={() => void removeNote(note.id)}
          >
            <Trash2 size={iconPx} />
          </button>
        </div>
      </div>

      {/* color palette popover */}
      {paletteOpen && (
        <div
          className="absolute z-10 flex rounded-lg bg-[var(--surface-solid)] shadow-xl ring-1 ring-[var(--border)]"
          style={{
            top: headerH + 2,
            right: 6 * cs,
            gap: 4 * cs,
            padding: 6 * cs,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* accent-following default */}
          <button
            className={`rounded-full ring-1 ring-black/20 ${
              note.color === null ? "outline outline-2 outline-[var(--accent)]" : ""
            }`}
            style={{ width: 18 * cs, height: 18 * cs, background: "var(--accent)" }}
            aria-label="Theme accent"
            title="Theme accent"
            onClick={() => pickColor(null)}
          />
          {NOTE_COLOR_KEYS.map((key) => (
            <button
              key={key}
              className={`rounded-full ring-1 ring-black/20 ${
                note.color === key ? "outline outline-2 outline-[var(--accent)]" : ""
              }`}
              style={{
                width: 18 * cs,
                height: 18 * cs,
                background: NOTE_PALETTE[key].bg,
              }}
              aria-label={key}
              title={key}
              onClick={() => pickColor(key)}
            />
          ))}
        </div>
      )}

      {/* body */}
      <textarea
        value={note.text}
        onChange={(e) => patchNoteText(note.id, e.target.value)}
        onFocus={() => bringNoteToFront(note.id)}
        placeholder="Write a note…"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-2.5 pb-2.5 outline-none placeholder:opacity-40"
        style={{ color: "inherit", fontSize: note.fontSize, lineHeight: 1.3 }}
      />

      {/* resize handle (bottom-right corner) */}
      <div
        className="absolute bottom-0 right-0 cursor-nwse-resize"
        style={{ width: handlePx, height: handlePx, touchAction: "none" }}
        onPointerDown={startGesture("resize")}
      >
        <svg viewBox="0 0 10 10" className="h-full w-full opacity-40">
          <path d="M9 3 L3 9 M9 6 L6 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
