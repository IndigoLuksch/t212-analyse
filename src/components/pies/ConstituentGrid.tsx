"use client";

import Link from "next/link";
import { IndexedLinesChart } from "./IndexedLinesChart";
import { formatGbp, formatPct, formatXirr } from "@/lib/format/numbers";
import type { PieConstituent } from "@/lib/analysis/pies";

const stockHref = (ticker: string) => `/stocks/${encodeURIComponent(ticker)}`;

const slotColor = (slot: number | null, i: number) =>
  `var(--slot-${slot != null ? (slot % 8) + 1 : (i % 8) + 1})`;

/**
 * One small chart per constituent, each rebased to 100 at the pie's creation
 * date so their shapes are directly comparable, with the pie's own benchmarks
 * drawn behind for reference.
 */
export function ConstituentGrid({
  constituents,
  benchTwr,
  sp500Twr,
}: {
  constituents: PieConstituent[];
  benchTwr: { date: string; index: number }[];
  sp500Twr: { date: string; index: number }[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {constituents.map((c, i) => (
        <div key={c.ticker} className="space-y-2">
          <IndexedLinesChart
            title={c.name}
            // One rate per holding: XIRR where the flows support it, the
            // compounded total otherwise, and never both.
            caption={`${formatPct(c.targetShare)} target · ${formatGbp(c.valueGbp)} · ${
              c.xirr != null
                ? `${formatXirr(c.xirr, false)}/yr`
                : c.annualisedReturn != null
                  ? `${formatPct(c.annualisedReturn, { signed: true })}/yr`
                  : `${formatPct(c.totalReturn, { signed: true })} total`
            }`}
            series={[
              {
                id: c.ticker,
                name: c.name,
                color: slotColor(c.colorSlot, i),
                points: c.indexed,
              },
              { id: "bench", name: "All-World", color: "var(--muted)", points: benchTwr },
              { id: "sp500", name: "S&P 500", color: "var(--slot-4)", points: sp500Twr },
            ]}
          />
          <div className="px-1 text-[13px] text-muted">
            <Link href={stockHref(c.ticker)} className="hover:underline">
              {c.ticker}
            </Link>
            {c.yahooSymbol && ` · ${c.yahooSymbol}`}
            {c.firstBuy && ` · first bought ${c.firstBuy}`}
          </div>
        </div>
      ))}
    </div>
  );
}
