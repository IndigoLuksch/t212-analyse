"use client";

import Link from "next/link";
import { ChartCard } from "@/components/charts";
import { formatGbp, formatPct } from "@/lib/format/numbers";
import type { PieConstituent } from "@/lib/analysis/pies";

const stockHref = (ticker: string) => `/stocks/${encodeURIComponent(ticker)}`;

/**
 * Target vs actual weight, as a diverging bar per constituent.
 *
 * The bar is centred on the target, so the eye reads distance-from-target
 * directly instead of comparing two similar-looking percentages.
 */
export function DriftTable({ constituents }: { constituents: PieConstituent[] }) {
  const maxDrift = Math.max(
    1,
    ...constituents.map((c) => Math.abs(c.driftPp)),
  );

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Holding</th>
          <th className="py-2 pr-4">Target</th>
          <th className="py-2 pr-4">Actual</th>
          <th className="py-2 pr-4">Drift</th>
          <th className="py-2 pr-4">Value</th>
          <th className="py-2">Shares</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {constituents.map((c) => (
          <tr key={c.ticker} className="border-b border-border">
            <td className="py-2 pr-4">{c.name}</td>
            <td className="py-2 pr-4">{formatPct(c.targetShare)}</td>
            <td className="py-2 pr-4">{formatPct(c.actualShare)}</td>
            <td className="py-2 pr-4">{c.driftPp >= 0 ? "+" : ""}{c.driftPp.toFixed(2)}pp</td>
            <td className="py-2 pr-4">{formatGbp(c.valueGbp)}</td>
            <td className="py-2">{c.shares.toFixed(6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Target vs actual weight"
      caption="Drift from the pie's target allocation, in percentage points"
      table={table}
    >
      <div className="space-y-2">
        {constituents.map((c) => {
          const pct = (Math.abs(c.driftPp) / maxDrift) * 50;
          const over = c.driftPp >= 0;
          return (
            <div key={c.ticker} className="flex items-center gap-3 text-[13px]">
              <Link
                href={stockHref(c.ticker)}
                className="w-[38%] shrink-0 truncate text-ink hover:underline"
                title={c.name}
              >
                {c.name}
              </Link>
              <span className="w-14 shrink-0 text-right tabular text-muted">
                {formatPct(c.targetShare)}
              </span>
              <div className="relative h-4 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--baseline)]" />
                <div
                  className="absolute inset-y-0 rounded-sm"
                  style={{
                    left: over ? "50%" : `${50 - pct}%`,
                    width: `${pct}%`,
                    background: over ? "var(--slot-1)" : "var(--slot-4)",
                  }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular text-muted">
                {c.driftPp >= 0 ? "+" : ""}
                {c.driftPp.toFixed(2)}pp
              </span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
