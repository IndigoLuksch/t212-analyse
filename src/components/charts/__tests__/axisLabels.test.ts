import { describe, expect, it } from "vitest";
import {
  axisTimeTickBudget,
  estimateLabelWidth,
  layoutAxisLabels,
  type AxisLabel,
} from "../format";
import { createLinearScale, createTimeScale, linearTicks, timeTicks } from "../scales";

/** Rendered [left, right] of a label, given where it is anchored. */
function extent<T>(label: AxisLabel<T>, width: number): [number, number] {
  const { x, anchor } = label;
  if (anchor === "start") return [x, x + width];
  if (anchor === "end") return [x - width, x];
  return [x - width / 2, x + width / 2];
}

function collisions<T>(labels: AxisLabel<T>[], format: (t: T) => string): string[] {
  const bad: string[] = [];
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1]!;
    const curr = labels[i]!;
    const prevRight = extent(prev, estimateLabelWidth(format(prev.tick)))[1];
    const currLeft = extent(curr, estimateLabelWidth(format(curr.tick)))[0];
    if (currLeft < prevRight) {
      bad.push(`${format(prev.tick)} | ${format(curr.tick)}`);
    }
  }
  return bad;
}

/** Plot widths a card actually hits between a phone and a fullscreen monitor. */
const WIDTHS = [180, 220, 260, 300, 360, 420, 456, 520, 640, 724, 810, 1000, 1400];

/** Spans that stress d3's tick snapping: it returns ~2× the requested count. */
const SPANS_IN_DAYS = [30, 60, 90, 150, 200, 365, 500, 730, 900, 1200, 2000, 3650];

describe("layoutAxisLabels", () => {
  it("never overlaps time labels, at any width or span", () => {
    for (const days of SPANS_IN_DAYS) {
      for (const width of WIDTHS) {
        const end = new Date(Date.UTC(2026, 6, 29));
        const start = new Date(end.getTime() - days * 86_400_000);
        const scale = createTimeScale([start, end], [0, width]);
        const budget = axisTimeTickBudget(width);
        const labels = layoutAxisLabels(
          timeTicks(scale, budget.tickCount),
          (t) => scale(t),
          (t) => estimateLabelWidth(budget.format(t)),
          width,
        );
        expect(
          collisions(labels, budget.format),
          `days=${days} width=${width}`,
        ).toEqual([]);
      }
    }
  });

  it("never overlaps linear labels", () => {
    const format = (n: number) => `${n.toFixed(1)}y`;
    for (const hi of [0.4, 1, 2.5, 7, 40, 1200]) {
      for (const width of WIDTHS) {
        const scale = createLinearScale([0, hi], [0, width]);
        const labels = layoutAxisLabels(
          linearTicks(scale, 10),
          (t) => scale(t),
          (t) => estimateLabelWidth(format(t)),
          width,
        );
        expect(collisions(labels, format), `hi=${hi} width=${width}`).toEqual([]);
      }
    }
  });

  it("keeps every label inside the plot", () => {
    for (const width of WIDTHS) {
      const end = new Date(Date.UTC(2026, 6, 29));
      const start = new Date(end.getTime() - 900 * 86_400_000);
      const scale = createTimeScale([start, end], [0, width]);
      const budget = axisTimeTickBudget(width);
      const labels = layoutAxisLabels(
        timeTicks(scale, budget.tickCount),
        (t) => scale(t),
        (t) => estimateLabelWidth(budget.format(t)),
        width,
      );
      for (const label of labels) {
        const [l, r] = extent(label, estimateLabelWidth(budget.format(label.tick)));
        expect(l, `width=${width} ${budget.format(label.tick)}`).toBeGreaterThan(-1);
        expect(r, `width=${width} ${budget.format(label.tick)}`).toBeLessThan(width + 1);
      }
    }
  });

  it("keeps the most recent date — the last tick always survives", () => {
    const end = new Date(Date.UTC(2026, 6, 29));
    const start = new Date(end.getTime() - 900 * 86_400_000);
    const scale = createTimeScale([start, end], [0, 300]);
    const budget = axisTimeTickBudget(300);
    const ticks = timeTicks(scale, budget.tickCount);
    const labels = layoutAxisLabels(
      ticks,
      (t) => scale(t),
      (t) => estimateLabelWidth(budget.format(t)),
      300,
    );
    expect(labels.at(-1)!.tick.getTime()).toBe(ticks.at(-1)!.getTime());
    // The bug this guards: d3 hands back far more ticks than 300px can hold.
    expect(ticks.length).toBeGreaterThan(labels.length);
  });

  it("returns ticks in ascending order", () => {
    const scale = createLinearScale([0, 10], [0, 400]);
    const labels = layoutAxisLabels(
      linearTicks(scale, 10),
      (t) => scale(t),
      () => 30,
      400,
    );
    const xs = labels.map((l) => l.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("passes through a single tick untouched", () => {
    const scale = createLinearScale([0, 10], [0, 400]);
    expect(layoutAxisLabels([5], (t) => scale(t), () => 30, 400)).toEqual([
      { tick: 5, x: 200, anchor: "middle" },
    ]);
  });

  it("handles an empty tick list", () => {
    expect(layoutAxisLabels([], () => 0, () => 10, 400)).toEqual([]);
  });
});
