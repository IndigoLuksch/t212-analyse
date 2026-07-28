"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard, DecompositionBar } from "@/components/charts";
import { MetricTip } from "@/components/ui/MetricTip";
import type { MetricId } from "@/lib/metrics/glossary";
import { formatGbp, formatPct, formatShares, formatXirr } from "@/lib/format/numbers";

type Position = {
  ticker: string;
  name: string;
  stalePrice: boolean;
  isOpen: boolean;
  shares: number;
  avgCostGbp: number;
  valueGbp: number;
  weight: number;
  pnlGbp: number;
  totalReturn: number;
  xirr: number | null;
  suppressAnnualised: boolean;
  decomposition: {
    priceGbp: number;
    dividendsGbp: number;
    fxGbp: number;
    totalGbp: number;
  };
};

type SortKey = "name" | "shares" | "avgCostGbp" | "valueGbp" | "weight" | "pnlGbp" | "totalReturn" | "xirr";

interface HoldingsTableProps {
  positions: Position[];
}

function decompositionSegments(p: Position) {
  return [
    { id: "price" as const, label: "Price", value: p.decomposition.priceGbp, color: "var(--slot-1)" },
    { id: "dividends" as const, label: "Div", value: p.decomposition.dividendsGbp, color: "var(--slot-3)" },
    { id: "fx" as const, label: "FX", value: p.decomposition.fxGbp, color: "var(--slot-4)" },
  ];
}

export function HoldingsTable({ positions }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("valueGbp");
  const [sortAsc, setSortAsc] = useState(false);

  const open = useMemo(
    () => positions.filter((p) => p.isOpen),
    [positions],
  );

  const sorted = useMemo(() => {
    const rows = [...open];
    rows.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "xirr":
          av = a.suppressAnnualised || a.xirr == null ? -Infinity : a.xirr;
          bv = b.suppressAnnualised || b.xirr == null ? -Infinity : b.xirr;
          break;
        default:
          av = a[sortKey] as number;
          bv = b[sortKey] as number;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [open, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }

  function SortHeader({
    label,
    col,
    metric,
  }: {
    label: string;
    col: SortKey;
    metric?: MetricId;
  }) {
    const active = sortKey === col;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={`text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${active ? "text-ink" : "text-muted"}`}
        >
          {label}
          {active ? (sortAsc ? " ↑" : " ↓") : ""}
        </button>
        {metric ? <MetricTip metric={metric} /> : null}
      </span>
    );
  }

  return (
    <ChartCard title="Holdings" caption="Open positions">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Name" col="name" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Shares" col="shares" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Avg cost" col="avgCostGbp" metric="avgCost" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Value" col="valueGbp" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Weight" col="weight" metric="weight" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Profit" col="pnlGbp" metric="profit" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="Return" col="totalReturn" metric="totalReturn" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader label="XIRR" col="xirr" metric="xirr" />
              </th>
              <th className="py-2 font-normal text-muted">
                <span className="inline-flex items-center gap-1">
                  Decomp
                  <MetricTip metric="decomposition" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((p) => (
              <tr key={p.ticker} className="border-b border-border hover:bg-page">
                <td className="py-3 pr-4">
                  <Link href={`/stocks/${encodeURIComponent(p.ticker)}`} className="hover:underline">
                    <span className="text-ink">{p.name}</span>
                    {p.stalePrice && (
                      <span className="ml-2 rounded bg-page px-1.5 py-0.5 text-[11px] text-muted">
                        stale price
                      </span>
                    )}
                  </Link>
                </td>
                <td className="py-3 pr-4">{formatShares(p.shares)}</td>
                <td className="py-3 pr-4">{formatGbp(p.avgCostGbp)}</td>
                <td className="py-3 pr-4">{formatGbp(p.valueGbp)}</td>
                <td className="py-3 pr-4">{formatPct(p.weight)}</td>
                <td
                  className={`py-3 pr-4 ${p.pnlGbp >= 0 ? "text-positive" : "text-negative"}`}
                >
                  {formatGbp(p.pnlGbp, { signed: true })}
                </td>
                <td
                  className={`py-3 pr-4 ${p.totalReturn >= 0 ? "text-positive" : "text-negative"}`}
                >
                  {formatPct(p.totalReturn, { signed: true })}
                </td>
                <td className="py-3 pr-4">
                  {formatXirr(p.xirr, p.suppressAnnualised)}
                </td>
                <td className="py-3">
                  <DecompositionBar segments={decompositionSegments(p)} width={120} height={12} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="py-8 text-center text-muted">No open positions</p>
        )}
      </div>
    </ChartCard>
  );
}
