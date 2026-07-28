"use client";

import { useMemo } from "react";
import { RangeBrush } from "./RangeBrush";
import { parseIsoDate, toIsoDate } from "./format";
import { formatDate } from "@/lib/format/numbers";
import type { DatePoint } from "./types";

export type RangePreset = "1Y" | "3Y" | "5Y" | "Max" | "Held";

export interface RangeState {
  start: string;
  end: string;
  preset: RangePreset | "Custom";
}

interface TimeRangeControlProps {
  width: number;
  /** ISO, earliest available. */
  min: string;
  /** ISO, latest available. */
  max: string;
  value: RangeState;
  onChange: (next: RangeState) => void;
  presets?: RangePreset[];
  /** Concrete window for a named preset — used for "Held" on stock pages. */
  resolvePreset?: (p: RangePreset) => { start: string; end: string } | null;
  context?: DatePoint[];
}

const DEFAULT_PRESETS: RangePreset[] = ["1Y", "3Y", "5Y", "Max"];

/** N years back from `max`; "Max" and an unresolved "Held" fall back to the full extent. */
export function resolvePresetRange(
  preset: RangePreset,
  min: string,
  max: string,
): { start: string; end: string } {
  const years = preset === "1Y" ? 1 : preset === "3Y" ? 3 : preset === "5Y" ? 5 : 0;
  if (years === 0) return { start: min, end: max };
  const from = parseIsoDate(max);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  const start = toIsoDate(from);
  return { start: start < min ? min : start, end: max };
}

export function TimeRangeControl({
  width,
  min,
  max,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  resolvePreset,
  context,
}: TimeRangeControlProps) {
  const domain = useMemo<[Date, Date]>(
    () => [parseIsoDate(min), parseIsoDate(max)],
    [min, max],
  );
  const selection = useMemo<[Date, Date]>(
    () => [parseIsoDate(value.start), parseIsoDate(value.end)],
    [value.start, value.end],
  );

  const selectPreset = (preset: RangePreset) => {
    const resolved = resolvePreset?.(preset) ?? resolvePresetRange(preset, min, max);
    if (!resolved) return;
    onChange({ start: resolved.start, end: resolved.end, preset });
  };

  const showBrush = width > 0 && Boolean(min) && Boolean(max) && min < max;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((preset, i) => (
            <span key={preset} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted">·</span>}
              <button
                type="button"
                onClick={() => selectPreset(preset)}
                className={
                  value.preset === preset
                    ? "font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                    : "text-muted hover:text-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                }
              >
                {preset}
              </button>
            </span>
          ))}
        </div>
        <span className="tabular shrink-0 text-muted">
          {formatDate(value.start)} – {formatDate(value.end)}
        </span>
      </div>
      {showBrush && (
        <RangeBrush
          width={width}
          domain={domain}
          value={selection}
          onChange={([start, end]) =>
            onChange({ start: toIsoDate(start), end: toIsoDate(end), preset: "Custom" })
          }
          context={context}
        />
      )}
    </div>
  );
}
