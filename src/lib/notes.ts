import type { CSSProperties } from "react";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";

// Data-access + presentation for canvas sticky notes. Kept separate from repo.ts
// (board items) since notes are an independent concern: free-form text cards with
// their own geometry, a palette color, and a glass toggle. DB columns are
// snake_case; the app-facing Note type is camelCase (this file owns the mapping).

export interface Note {
  id: string;
  boardId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  /** Palette key (see NOTE_PALETTE), or null to follow the theme accent. */
  color: NoteColorKey | null;
  /** Frosted-glass background instead of solid. */
  glass: boolean;
  /** Base text size in world-space px (the UI floors it for readability at low zoom). */
  fontSize: number;
  createdAt: number;
}

interface NoteRow {
  id: string;
  board_id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  color: string | null;
  glass: number;
  font_size: number;
  created_at: number;
}

// ---------- palette + styling ----------

export type NoteColorKey =
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "blue"
  | "gray";

// Coloured paper stock, not highlighter. The keys are what's stored, so these
// values can be retuned without touching a single saved note.
//
// The old palette was Tailwind 200s — candy-bright against a board of images,
// and louder than anything else in a UI built from paper and hairlines. These
// are the same six hues taken down to the weight of index-card stock, so a note
// reads as something clipped to the sheet rather than stuck on the screen.
// Every pair is ~10:1, so note text is legible whatever theme is underneath.
export const NOTE_PALETTE: Record<NoteColorKey, { bg: string; text: string }> = {
  yellow: { bg: "#efe3bf", text: "#3d3115" },
  green: { bg: "#d6e3d2", text: "#1f3324" },
  pink: { bg: "#efd7d7", text: "#44201f" },
  purple: { bg: "#ded8e8", text: "#2e2440" },
  blue: { bg: "#d3dee8", text: "#1b2d3d" },
  gray: { bg: "#e2e1dc", text: "#2b2b28" },
};

export const NOTE_COLOR_KEYS = Object.keys(NOTE_PALETTE) as NoteColorKey[];

// Default note text size, and the ladder the A-/A+ stepper walks (world px).
export const DEFAULT_NOTE_FONT_SIZE = 14;
export const NOTE_FONT_SIZES = [
  10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64,
] as const;

/**
 * Step a font size along NOTE_FONT_SIZES: `dir > 0` picks the next larger size,
 * `dir < 0` the next smaller, snapping a between-ladder value to its neighbour.
 * Clamped at both ends.
 */
export function stepFontSize(current: number, dir: 1 | -1): number {
  // Index of the ladder entry closest to the current size.
  let closest = 0;
  for (let i = 1; i < NOTE_FONT_SIZES.length; i++) {
    if (
      Math.abs(NOTE_FONT_SIZES[i] - current) <
      Math.abs(NOTE_FONT_SIZES[closest] - current)
    ) {
      closest = i;
    }
  }
  const next = Math.min(
    NOTE_FONT_SIZES.length - 1,
    Math.max(0, closest + dir),
  );
  return NOTE_FONT_SIZES[next];
}

/**
 * CSS for a note's card. `color === null` follows the current theme accent (so
 * uncolored notes restyle with the theme); a palette key uses a fixed color. The
 * glass variant swaps the solid fill for a translucent, blurred one.
 */
export function noteStyle(
  color: NoteColorKey | null,
  glass: boolean,
): CSSProperties {
  if (color === null) {
    // Accent-following default: the plain sheet. Paper and ink from the active
    // theme, so an uncoloured note restyles with it.
    return glass
      ? {
          background: "color-mix(in srgb, var(--surface-solid) 55%, transparent)",
          color: "var(--text)",
          border: "1px solid var(--accent)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }
      : {
          background: "var(--surface-solid)",
          color: "var(--text)",
          border: "1px solid var(--accent)",
        };
  }
  const { bg, text } = NOTE_PALETTE[color];
  // The rule is the card's own ink, thinned — a hairline in the same family,
  // rather than the old darkened-background edge that went muddy on every hue.
  const line = `color-mix(in srgb, ${text} 32%, ${bg})`;
  return glass
    ? {
        background: `color-mix(in srgb, ${bg} 55%, transparent)`,
        color: text,
        border: `1px solid ${line}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }
    : {
        background: bg,
        color: text,
        border: `1px solid ${line}`,
      };
}

/**
 * The note's title block: the header strip is one step toward the card's ink,
 * closed by a hairline, so the controls sit in a ruled cell instead of floating
 * over the text. Mirrors the way chrome separates areas with a line, not a gap.
 */
export function noteHeaderStyle(
  color: NoteColorKey | null,
  glass: boolean,
): CSSProperties {
  if (color === null) {
    return {
      background: glass
        ? "transparent"
        : "color-mix(in srgb, var(--accent) 12%, var(--surface-solid))",
      borderBottom: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
    };
  }
  const { bg, text } = NOTE_PALETTE[color];
  return {
    background: glass ? "transparent" : `color-mix(in srgb, ${text} 9%, ${bg})`,
    borderBottom: `1px solid color-mix(in srgb, ${text} 22%, ${bg})`,
  };
}

// ---------- row mapper ----------

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  boardId: r.board_id,
  text: r.text,
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  z: r.z,
  color: (r.color as NoteColorKey | null) ?? null,
  glass: r.glass !== 0,
  fontSize: r.font_size,
  createdAt: r.created_at,
});

// ---------- repo ----------

export async function listNotes(boardId: string): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE board_id = $1 ORDER BY z ASC, created_at ASC",
    [boardId],
  );
  return rows.map(toNote);
}

export async function createNote(
  boardId: string,
  partial: Partial<Note> & Pick<Note, "x" | "y" | "width" | "height">,
): Promise<Note> {
  const db = await getDb();
  const note: Note = {
    id: partial.id ?? uuid(),
    boardId,
    text: partial.text ?? "",
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    z: partial.z ?? 0,
    color: partial.color ?? null,
    glass: partial.glass ?? false,
    fontSize: partial.fontSize ?? DEFAULT_NOTE_FONT_SIZE,
    createdAt: partial.createdAt ?? Date.now(),
  };
  await db.execute(
    `INSERT INTO notes
       (id, board_id, text, x, y, width, height, z, color, glass, font_size, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      note.id,
      note.boardId,
      note.text,
      note.x,
      note.y,
      note.width,
      note.height,
      note.z,
      note.color,
      note.glass ? 1 : 0,
      note.fontSize,
      note.createdAt,
    ],
  );
  return note;
}

/** Patches the mutable fields of a note (text/geometry/z/color/glass). */
export async function updateNote(
  id: string,
  patch: Partial<
    Pick<
      Note,
      | "text"
      | "x"
      | "y"
      | "width"
      | "height"
      | "z"
      | "color"
      | "glass"
      | "fontSize"
    >
  >,
): Promise<void> {
  const cols: Record<string, string> = {
    text: "text",
    x: "x",
    y: "y",
    width: "width",
    height: "height",
    z: "z",
    color: "color",
    glass: "glass",
    fontSize: "font_size",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(cols)) {
    if (key in patch) {
      sets.push(`${col} = $${i++}`);
      const v = (patch as Record<string, unknown>)[key];
      // glass is a boolean in the app, 0/1 in the DB.
      vals.push(key === "glass" ? (v ? 1 : 0) : v);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  const db = await getDb();
  await db.execute(`UPDATE notes SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
}
