import { describe, expect, it } from "vitest";
import { placeFloating } from "../floating";

const VIEWPORT = { width: 400, height: 400 };

describe("placeFloating", () => {
  it("flips left when the box would cross the right edge", () => {
    const anchor = { x: 380, y: 100 };
    const box = { width: 100, height: 50 };
    const { left } = placeFloating(anchor, box, VIEWPORT);
    expect(left).toBe(anchor.x - 12 - box.width);
  });

  it("flips up when the box would cross the bottom edge", () => {
    const anchor = { x: 100, y: 380 };
    const box = { width: 50, height: 50 };
    const { top } = placeFloating(anchor, box, VIEWPORT);
    expect(top).toBe(anchor.y - 12 - box.height);
  });

  it("clamps a box wider than the viewport to margin, not negative", () => {
    const anchor = { x: 50, y: 50 };
    const box = { width: 500, height: 40 };
    const margin = 8;
    const { left } = placeFloating(anchor, box, VIEWPORT, 12, margin);
    expect(left).toBe(margin);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("prefers down-right when the box fits on both sides", () => {
    const anchor = { x: 100, y: 100 };
    const box = { width: 50, height: 50 };
    const gap = 12;
    const { left, top } = placeFloating(anchor, box, VIEWPORT, gap);
    expect(left).toBe(anchor.x + gap);
    expect(top).toBe(anchor.y + gap);
  });
});
