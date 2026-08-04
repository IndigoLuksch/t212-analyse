import { describe, expect, it } from "vitest";
import {
  clampLabelX,
  estimateTextWidth,
  findNearestXIndex,
  linearXPosition,
} from "../layout";

describe("estimateTextWidth", () => {
  it("scales with length and font size", () => {
    expect(estimateTextWidth("abcd", 10)).toBe(24);
    expect(estimateTextWidth("", 12)).toBe(0);
    expect(estimateTextWidth("x", 20)).toBe(12);
  });
});

describe("clampLabelX", () => {
  const width = 100;
  const min = 2;
  const max = width - 2;

  it("shifts a label at x=0 right by half its width", () => {
    const textWidth = 20;
    expect(clampLabelX(0, textWidth, min, max)).toBe(min + textWidth / 2);
  });

  it("shifts a label at x=width left by half its width", () => {
    const textWidth = 20;
    expect(clampLabelX(width, textWidth, min, max)).toBe(max - textWidth / 2);
  });

  it("pins to min when label is wider than the plot", () => {
    const textWidth = 200;
    expect(clampLabelX(50, textWidth, min, max)).toBe(min);
  });

  it("leaves a centred label unchanged when it fits", () => {
    const textWidth = 20;
    expect(clampLabelX(50, textWidth, min, max)).toBe(50);
  });
});

describe("linearXPosition", () => {
  it("maps domain endpoints to range endpoints", () => {
    expect(linearXPosition(0, [0, 10], [0, 100])).toBe(0);
    expect(linearXPosition(10, [0, 10], [0, 100])).toBe(100);
    expect(linearXPosition(5, [0, 10], [0, 100])).toBe(50);
  });

  it("handles inverted ranges", () => {
    expect(linearXPosition(0, [0, 10], [100, 0])).toBe(100);
    expect(linearXPosition(10, [0, 10], [100, 0])).toBe(0);
  });
});

describe("findNearestXIndex", () => {
  it("returns -1 for an empty array", () => {
    expect(findNearestXIndex([], 5)).toBe(-1);
  });

  it("picks the closest index by absolute distance", () => {
    expect(findNearestXIndex([1, 3, 7, 9], 4)).toBe(1);
    expect(findNearestXIndex([1, 3, 7, 9], 8)).toBe(2);
    expect(findNearestXIndex([1, 3, 7, 9], 1)).toBe(0);
  });
});
