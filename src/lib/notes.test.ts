import { describe, expect, it, vi } from "vitest";

// notes.ts imports the sql db layer at module load; stub it so the pure
// palette/style helpers can be imported in a plain Node test.
vi.mock("./db", () => ({ getDb: vi.fn() }));

const { NOTE_COLOR_KEYS, NOTE_FONT_SIZES, NOTE_PALETTE, noteStyle, stepFontSize } =
  await import("./notes");

describe("NOTE_PALETTE", () => {
  it("exposes the six fixed sticky colors", () => {
    expect(NOTE_COLOR_KEYS).toEqual([
      "yellow",
      "green",
      "pink",
      "purple",
      "blue",
      "gray",
    ]);
    for (const key of NOTE_COLOR_KEYS) {
      expect(NOTE_PALETTE[key]).toHaveProperty("bg");
      expect(NOTE_PALETTE[key]).toHaveProperty("text");
    }
  });
});

describe("noteStyle", () => {
  it("follows the theme accent when color is null (solid)", () => {
    // The accent carries the card's rule, not a wash over its face: text sits
    // on plain paper so it stays legible whatever the accent is set to.
    const s = noteStyle(null, false);
    expect(String(s.border)).toContain("var(--accent)");
    expect(s.background).toBe("var(--surface-solid)");
    expect(s.color).toBe("var(--text)");
    expect(s.backdropFilter).toBeUndefined();
  });

  it("uses the fixed palette color for a known key (solid)", () => {
    const s = noteStyle("yellow", false);
    expect(s.background).toBe(NOTE_PALETTE.yellow.bg);
    expect(s.color).toBe(NOTE_PALETTE.yellow.text);
    expect(s.backdropFilter).toBeUndefined();
  });

  it("adds a blur backdrop for the glass variant", () => {
    expect(noteStyle(null, true).backdropFilter).toContain("blur");
    expect(noteStyle("blue", true).backdropFilter).toContain("blur");
  });
});

describe("stepFontSize", () => {
  const first = NOTE_FONT_SIZES[0];
  const last = NOTE_FONT_SIZES[NOTE_FONT_SIZES.length - 1];

  it("moves to the next/previous ladder size", () => {
    expect(stepFontSize(14, 1)).toBe(16);
    expect(stepFontSize(14, -1)).toBe(12);
  });

  it("clamps at both ends of the ladder", () => {
    expect(stepFontSize(first, -1)).toBe(first);
    expect(stepFontSize(last, 1)).toBe(last);
  });

  it("snaps a between-ladder value to a neighbour", () => {
    // 15 is closest to 14 (index 2) → up gives 16, down gives 12.
    expect(stepFontSize(15, 1)).toBe(16);
    expect(stepFontSize(15, -1)).toBe(12);
  });
});
