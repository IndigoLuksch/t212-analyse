"use client";

import { TABULAR_CLASS } from "./format";
import { formatGbp } from "@/lib/format/numbers";

export interface DecompositionSegment {
  id: "price" | "dividends" | "fx";
  label: string;
  value: number;
  color: string;
}

interface DecompositionBarProps {
  segments: DecompositionSegment[];
  width?: number;
  height?: number;
}

const DEFAULT_COLORS: Record<DecompositionSegment["id"], string> = {
  price: "var(--slot-1)",
  dividends: "var(--slot-3)",
  fx: "var(--slot-4)",
};

export function DecompositionBar({ segments, width = 320, height = 20 }: DecompositionBarProps) {
  const total = segments.reduce((s, seg) => s + Math.abs(seg.value), 0) || 1;
  const signedTotal = segments.reduce((s, seg) => s + seg.value, 0);
  let x = 0;

  return (
    <div className="space-y-2">
      <svg width={width} height={height} role="img" aria-label="Return decomposition">
        {segments.map((seg) => {
          const w = (Math.abs(seg.value) / total) * width;
          const color = seg.color || DEFAULT_COLORS[seg.id];
          const rect = (
            <rect
              key={seg.id}
              x={x}
              y={0}
              width={Math.max(w, seg.value !== 0 ? 2 : 0)}
              height={height}
              fill={color}
              rx={seg.id === "fx" ? 4 : 0}
            />
          );
          x += w;
          return rect;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {segments.map((seg) => (
          <div key={seg.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: seg.color || DEFAULT_COLORS[seg.id] }}
            />
            <span className="text-ink-secondary">{seg.label}</span>
            <span className={`text-ink ${TABULAR_CLASS}`}>
              {formatGbp(seg.value, { signed: true })}
            </span>
          </div>
        ))}
        <div className={`ml-auto text-ink-secondary ${TABULAR_CLASS}`}>
          Total {formatGbp(signedTotal, { signed: true })}
        </div>
      </div>
    </div>
  );
}
