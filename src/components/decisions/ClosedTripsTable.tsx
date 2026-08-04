"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts";
import { MetricTip } from "@/components/ui/MetricTip";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatDate, formatGbp, formatPct, formatRatio, formatXirr } from "@/lib/format/numbers";

type ClosedTrip = {
  ticker: string;
  name: string;
  start: string;
  end: string;
  invested: number;
  pnl: number;
  totalReturn: number;
  xirr: number | null;
  suppressAnnualised: boolean;
  holdYears: number;
  worstPoint: { date: string; drawdown: number } | null;
  buyDiscipline: number | null;
};

type SortKey = "name" | "start" | "end" | "holdYears" | "invested" | "pnl" | "totalReturn" | "xirr";

interface ClosedTripsTableProps {
  trips: ClosedTrip[];
  winRate: number | null;
  profitFactor: number | null;
}

export function ClosedTripsTable({ trips, winRate, profitFactor }: ClosedTripsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("end");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...trips];
    copy.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "start":
        case "end":
          av = a[sortKey];
          bv = b[sortKey];
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
    return copy;
  }, [trips, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }


  return (
    <ChartCard title="Closed round trips" caption="Completed buy-to-sell episodes">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Stock" col="name" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Entry → exit" col="start" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Hold" col="holdYears" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Invested" col="invested" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Profit" col="pnl" metric="profit" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Return" col="totalReturn" metric="totalReturn" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="XIRR" col="xirr" metric="xirr" />
              </th>
              <th className="py-2 font-normal text-muted">
                <span className="inline-flex items-center gap-1">
                  Worst
                  <MetricTip metric="worstPoint" />
                </span>
              </th>
              <th className="py-2 font-normal text-muted">
                <span className="inline-flex items-center gap-1">
                  Discipline
                  <MetricTip metric="buyDiscipline" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((t) => (
              <tr key={`${t.ticker}-${t.start}-${t.end}`} className="border-b border-border">
                <td className="py-3 pr-4">
                  <Link
                    href={`/stocks/${encodeURIComponent(t.ticker)}`}
                    className="text-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-ink-secondary">
                  {formatDate(t.start)} → {formatDate(t.end)}
                </td>
                <td className="py-3 pr-4">{t.holdYears.toFixed(1)}y</td>
                <td className="py-3 pr-4">{formatGbp(t.invested)}</td>
                <td className={`py-3 pr-4 ${t.pnl >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatGbp(t.pnl, { signed: true })}
                </td>
                <td className={`py-3 pr-4 ${t.totalReturn >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatPct(t.totalReturn, { signed: true })}
                </td>
                <td className="py-3 pr-4">{formatXirr(t.xirr, t.suppressAnnualised)}</td>
                <td className="py-3 pr-4">
                  {t.worstPoint ? formatPct(t.worstPoint.drawdown, { signed: true }) : "–"}
                </td>
                <td className="py-3 pr-4">
                  {t.buyDiscipline != null ? formatRatio(t.buyDiscipline) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="mt-4 flex flex-wrap items-center gap-4 text-sm text-ink-secondary">
        <span className="inline-flex items-center gap-1">
          Win rate: {winRate != null ? formatPct(winRate) : "–"}
          <MetricTip metric="winRate" />
        </span>
        <span className="inline-flex items-center gap-1">
          Profit factor: {profitFactor != null ? profitFactor.toFixed(2) : "–"}
          <MetricTip metric="profitFactor" />
        </span>
      </footer>
    </ChartCard>
  );
}
