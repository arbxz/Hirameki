import { describe, expect, it } from "vitest";
import { boundsOf, fitView } from "./geometry";
import type { Item } from "../types/board";

function item(p: Partial<Item> & Pick<Item, "x" | "y" | "width" | "height">): Item {
  return {
    id: "i",
    boardId: "b",
    groupId: null,
    filePath: null,
    srcUrl: null,
    rotation: 0,
    z: 0,
    naturalW: null,
    naturalH: null,
    createdAt: 0,
    ...p,
  };
}

describe("boundsOf", () => {
  it("returns null when there is nothing to measure", () => {
    expect(boundsOf([], [])).toBeNull();
  });

  it("covers a single unrotated item exactly", () => {
    expect(boundsOf([item({ x: 10, y: 20, width: 100, height: 50 })])).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });
  });

  it("spans several scattered items", () => {
    const box = boundsOf([
      item({ x: 0, y: 0, width: 50, height: 50 }),
      item({ x: 500, y: 300, width: 100, height: 100 }),
      item({ x: -200, y: 80, width: 40, height: 40 }),
    ]);
    expect(box).toEqual({ minX: -200, minY: 0, maxX: 600, maxY: 400 });
  });

  it("measures a rotated item by its corners, not its raw size", () => {
    // A 100x100 square rotated 45° about its top-left corner spans 100*sqrt(2)
    // horizontally... but rotation is about origin 0 0, so the hull runs from
    // x = -70.7 (the bottom-left corner swinging left) to x = +70.7.
    const box = boundsOf([
      item({ x: 0, y: 0, width: 100, height: 100, rotation: 45 }),
    ]);
    const d = Math.SQRT1_2 * 100; // ~70.71
    expect(box!.minX).toBeCloseTo(-d, 4);
    expect(box!.maxX).toBeCloseTo(d, 4);
    expect(box!.minY).toBeCloseTo(0, 4);
    expect(box!.maxY).toBeCloseTo(d * 2, 4);
    // The naive unrotated box would have been 0..100 on x — too small, which is
    // what would let a rotated image fall outside a zoom-to-fit.
    expect(box!.maxX - box!.minX).toBeGreaterThan(100);
  });

  it("includes plain rects (notes) alongside items", () => {
    const box = boundsOf(
      [item({ x: 0, y: 0, width: 10, height: 10 })],
      [{ x: 200, y: 150, width: 220, height: 200 }],
    );
    expect(box).toEqual({ minX: 0, minY: 0, maxX: 420, maxY: 350 });
  });
});

describe("fitView", () => {
  const opts = { padding: 80, minZoom: 0.1, maxZoom: 8 };
  const viewport = { width: 1000, height: 800 };

  it("centres the box in the viewport", () => {
    const box = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    const v = fitView(box, viewport, opts)!;
    // The box centre must land at the viewport centre: applying the canvas's
    // own screenToWorld to the middle of the screen should give it back.
    const worldAtScreenCentre = {
      x: v.x + viewport.width / 2 / v.zoom,
      y: v.y + viewport.height / 2 / v.zoom,
    };
    expect(worldAtScreenCentre.x).toBeCloseTo(200, 6);
    expect(worldAtScreenCentre.y).toBeCloseTo(100, 6);
  });

  it("fits the constraining axis and leaves the padding", () => {
    // 400x200 into 1000x800 with 80px padding: x allows (1000-160)/400 = 2.1,
    // y allows (800-160)/200 = 3.2 — so the wider axis wins.
    const v = fitView({ minX: 0, minY: 0, maxX: 400, maxY: 200 }, viewport, opts)!;
    expect(v.zoom).toBeCloseTo(2.1, 6);
  });

  it("clamps a tiny box to the maximum zoom", () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, viewport, opts)!;
    expect(v.zoom).toBe(8);
  });

  it("clamps a huge box to the minimum zoom", () => {
    const v = fitView(
      { minX: 0, minY: 0, maxX: 100000, maxY: 100000 },
      viewport,
      opts,
    )!;
    expect(v.zoom).toBe(0.1);
  });

  it("returns null for a degenerate box", () => {
    expect(fitView({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, viewport, opts)).toBeNull();
  });
});
