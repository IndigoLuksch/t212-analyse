"use client";

import type { ReactNode } from "react";

export interface LegendItem {
  id: string;
  name: ReactNode;
  color: string;
  mark?: "line" | "area" | "dot" | "bar" | "triangle-up" | "triangle-down";
}

interface LegendProps {
  items: LegendItem[];
  className?: string;
}

export function Legend({ items, className = "" }: LegendProps) {
  if (items.length < 2) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <LegendMark color={item.color} type={item.mark ?? "line"} />
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

function LegendMark({ color, type }: { color: string; type: LegendItem["mark"] }) {
  if (type === "dot") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
    );
  }
  if (type === "area") {
    return (
      <span className="inline-flex h-2.5 w-3 overflow-hidden rounded-sm">
        <span className="h-full w-full" style={{ backgroundColor: color, opacity: 0.3 }} />
      </span>
    );
  }
  if (type === "triangle-up" || type === "triangle-down") {
    return (
      <span
        className="inline-block h-0 w-0"
        style={
          type === "triangle-up"
            ? {
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderBottom: `7px solid ${color}`,
              }
            : {
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: `7px solid ${color}`,
              }
        }
      />
    );
  }
  if (type === "bar") {
    return (
      <span
        className="inline-block h-3 w-1.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
    );
  }
  return (
    <span
      className="inline-block h-0.5 w-4 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
