"use client";

import type { TimeRangeValue } from "./types";

interface TimeRangePresetsProps {
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
  minDate?: string;
  maxDate?: string;
}

const PRESETS = ["1Y", "3Y", "5Y", "Max"] as const;

export function TimeRangePresets({ value, onChange, minDate, maxDate }: TimeRangePresetsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      {PRESETS.map((preset, i) => (
        <span key={preset} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted">·</span>}
          <button
            type="button"
            onClick={() => onChange({ preset, start: undefined, end: undefined })}
            className={
              value.preset === preset
                ? "font-medium text-ink"
                : "text-muted hover:text-ink-secondary"
            }
          >
            {preset}
          </button>
        </span>
      ))}
      <span className="mx-2 h-4 w-px bg-border" aria-hidden />
      <span className="flex items-center gap-2">
        <label className="sr-only" htmlFor="range-start">
          Start date
        </label>
        <input
          id="range-start"
          type="date"
          min={minDate}
          max={maxDate}
          value={value.start ?? ""}
          onChange={(e) =>
            onChange({
              preset: "custom",
              start: e.target.value || undefined,
              end: value.end,
            })
          }
          className="rounded border border-border bg-page px-2 py-1 text-sm text-ink-secondary"
        />
        <span className="text-muted">–</span>
        <label className="sr-only" htmlFor="range-end">
          End date
        </label>
        <input
          id="range-end"
          type="date"
          min={minDate}
          max={maxDate}
          value={value.end ?? ""}
          onChange={(e) =>
            onChange({
              preset: "custom",
              start: value.start,
              end: e.target.value || undefined,
            })
          }
          className="rounded border border-border bg-page px-2 py-1 text-sm text-ink-secondary"
        />
      </span>
    </div>
  );
}
