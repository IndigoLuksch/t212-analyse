import type { ChartMargins } from "./types";

export const CHART_MARKS = {
  lineWidth: 2,
  markerMinSize: 8,
  markerRing: 2,
  hitTargetMin: 24,
  areaOpacity: 0.1,
  barMaxWidth: 24,
  barRadius: 4,
  stackGap: 2,
  fadedOpacity: 0.25,
  postMortemOpacity: 0.35,
} as const;

export const DEFAULT_MARGINS: ChartMargins = {
  top: 12,
  right: 16,
  bottom: 32,
  left: 52,
};

export const COMPACT_MARGINS: ChartMargins = {
  top: 4,
  right: 8,
  bottom: 20,
  left: 36,
};

export const SLOT_COLORS = [
  "var(--slot-1)",
  "var(--slot-2)",
  "var(--slot-3)",
  "var(--slot-4)",
  "var(--slot-5)",
  "var(--slot-6)",
  "var(--slot-7)",
  "var(--slot-8)",
] as const;
