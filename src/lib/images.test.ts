import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DIM, fitDimensions } from "./images";

describe("fitDimensions", () => {
  it("scales the longest edge down to the default max", () => {
    expect(fitDimensions(720, 360)).toEqual({ width: 360, height: 180 });
    expect(fitDimensions(1000, 2000)).toEqual({ width: 180, height: 360 });
  });

  it("never upscales images smaller than the cap", () => {
    expect(fitDimensions(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitDimensions(DEFAULT_MAX_DIM, DEFAULT_MAX_DIM)).toEqual({
      width: DEFAULT_MAX_DIM,
      height: DEFAULT_MAX_DIM,
    });
  });

  it("honours a custom max dimension", () => {
    expect(fitDimensions(400, 200, 100)).toEqual({ width: 100, height: 50 });
  });

  it("rounds to whole pixels", () => {
    const { width, height } = fitDimensions(333, 100, 100);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });
});
