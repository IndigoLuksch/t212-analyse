import { extent, max, min } from "d3-array";
import { scaleLinear, scaleTime, type ScaleLinear, type ScaleTime } from "d3-scale";

export function createTimeScale(
  domain: [Date, Date],
  range: [number, number],
): ScaleTime<number, number> {
  return scaleTime().domain(domain).range(range);
}

export function createLinearScale(
  domain: [number, number],
  range: [number, number],
): ScaleLinear<number, number> {
  return scaleLinear().domain(domain).range(range);
}

export function niceLinearDomain(
  values: number[],
  padding = 0.05,
): [number, number] {
  const lo = min(values) ?? 0;
  const hi = max(values) ?? 1;
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  return [lo - span * padding, hi + span * padding];
}

export function timeExtent(dates: Date[]): [Date, Date] {
  const e = extent(dates);
  if (!e[0] || !e[1]) return [new Date(), new Date()];
  return [e[0], e[1]];
}

export function linearTicks(scale: ScaleLinear<number, number>, count = 5): number[] {
  return scale.ticks(count);
}

export function timeTicks(scale: ScaleTime<number, number>, count = 6): Date[] {
  return scale.ticks(count);
}

export function bisectDate(dates: Date[], target: Date): number {
  let lo = 0;
  let hi = dates.length;
  const t = target.getTime();
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]!.getTime() < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function nearestDateIndex(dates: Date[], target: Date): number {
  if (dates.length === 0) return -1;
  const i = bisectDate(dates, target);
  if (i <= 0) return 0;
  if (i >= dates.length) return dates.length - 1;
  const before = dates[i - 1]!;
  const after = dates[i]!;
  return target.getTime() - before.getTime() < after.getTime() - target.getTime() ? i - 1 : i;
}
