import { describe, expect, it } from "vitest";
import { insertionIndex, moveItem, orderAfterDrop } from "./reorder";

const abcd = ["a", "b", "c", "d"];

describe("moveItem", () => {
  it("moves right and left", () => {
    expect(moveItem(abcd, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(abcd, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone for a no-op move", () => {
    expect(moveItem(abcd, 2, 2)).toEqual(abcd);
  });

  it("does not mutate the input", () => {
    const input = [...abcd];
    moveItem(input, 0, 3);
    expect(input).toEqual(abcd);
  });

  it("clamps indices instead of dropping items", () => {
    expect(moveItem(abcd, -3, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});

describe("insertionIndex", () => {
  // Four 100px-wide tabs starting at x=0 → midpoints 50, 150, 250, 350.
  const mids = [50, 150, 250, 350];

  it("finds the gap for a position", () => {
    expect(insertionIndex(mids, 10)).toBe(0); // before the first
    expect(insertionIndex(mids, 120)).toBe(1); // between first and second
    expect(insertionIndex(mids, 400)).toBe(4); // after the last
  });

  it("puts a drop exactly on a midpoint before that item", () => {
    expect(insertionIndex(mids, 150)).toBe(1);
  });

  it("handles an empty row", () => {
    expect(insertionIndex([], 42)).toBe(0);
  });
});

describe("orderAfterDrop", () => {
  it("dropping into your own gap changes nothing", () => {
    expect(orderAfterDrop(abcd, 1, 1)).toEqual(abcd);
    // ...and so does the gap immediately after you.
    expect(orderAfterDrop(abcd, 1, 2)).toEqual(abcd);
  });

  it("drags rightward without overshooting", () => {
    // "a" dropped into the gap before "d" lands between "c" and "d".
    expect(orderAfterDrop(abcd, 0, 3)).toEqual(["b", "c", "a", "d"]);
    // ...and into the final gap it goes last.
    expect(orderAfterDrop(abcd, 0, 4)).toEqual(["b", "c", "d", "a"]);
  });

  it("drags leftward", () => {
    expect(orderAfterDrop(abcd, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(orderAfterDrop(abcd, 2, 1)).toEqual(["a", "c", "b", "d"]);
  });
});
