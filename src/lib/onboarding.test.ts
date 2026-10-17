import { describe, expect, it } from "vitest";
import {
  clampStep,
  isLastStep,
  shouldAutoStart,
  TOUR_STEPS,
  TOUR_VERSION,
} from "./onboarding";

describe("tour steps", () => {
  it("every step has a unique id and non-empty copy", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it("only the centred steps go without an anchor", () => {
    for (const s of TOUR_STEPS) {
      if (!s.anchor) expect(s.placement).toBe("center");
    }
  });
});

describe("clampStep", () => {
  it("keeps an index inside the tour", () => {
    expect(clampStep(-5)).toBe(0);
    expect(clampStep(0)).toBe(0);
    expect(clampStep(TOUR_STEPS.length + 10)).toBe(TOUR_STEPS.length - 1);
  });

  it("survives nonsense", () => {
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(1.7)).toBe(1);
  });
});

describe("isLastStep", () => {
  it("is true only at the end", () => {
    expect(isLastStep(0)).toBe(false);
    expect(isLastStep(TOUR_STEPS.length - 1)).toBe(true);
    // ...including when the caller overshoots.
    expect(isLastStep(99)).toBe(true);
  });
});

describe("shouldAutoStart", () => {
  it("opens for someone who has never seen it", () => {
    expect(shouldAutoStart(null)).toBe(true);
  });

  it("stays shut once the current version is done", () => {
    expect(shouldAutoStart(TOUR_VERSION)).toBe(false);
  });

  it("re-opens when the tour has moved on", () => {
    expect(shouldAutoStart("0")).toBe(true);
  });

  it("treats a corrupted value as unseen rather than hiding forever", () => {
    expect(shouldAutoStart("")).toBe(true);
    expect(shouldAutoStart("banana")).toBe(true);
  });
});
