/**
 * Running start offset for each item in a stack: `[0, a, a+b, …]`.
 *
 * Module scope, not an inline `let x` accumulator inside a component — a
 * variable reassigned while mapping over JSX is reassigned after render
 * completes, which React's rules of hooks (rightly) reject.
 */
export function cumulativeOffsets(sizes: number[], start = 0): number[] {
  const offsets: number[] = [];
  let acc = start;
  for (const size of sizes) {
    offsets.push(acc);
    acc += size;
  }
  return offsets;
}

/** Rough advance width for the chart label font. 0.6em per glyph is within
 *  ~5% for the UI sans at 10–12px, and SVG gives us no cheap measurement. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/** Keep a centre-anchored label inside [min, max]. */
export function clampLabelX(x: number, textWidth: number, min: number, max: number): number {
  const half = textWidth / 2;
  if (textWidth >= max - min) return min; // pin to min rather than going negative / centering overflow
  return Math.min(Math.max(x, min + half), max - half);
}

/** Map data x to pixel via a linear domain/range. Pure for tests. */
export function linearXPosition(x: number, domain: [number, number], range: [number, number]): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return r0;
  return r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
}

/** Nearest index by x value given sorted points by x. */
export function findNearestXIndex(xs: number[], target: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(xs[0]! - target);
  for (let i = 1; i < xs.length; i++) {
    const dist = Math.abs(xs[i]! - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
