"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts";
import { MetricTip } from "@/components/ui/MetricTip";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatDate, formatGbp, formatPct } from "@/lib/format/numbers";

type ExitRow = {
  ticker: string;
  name: string;
  date: string;
  shares: number;
  proceedsGbp: number;
  rawAnn: number | null;
  adjAnn: number | null;
  ghostDeltaGbp: number;
  ghostDeltaPct: number;
  note: string;
  orderIds: string[];
};

type SortKey = "name" | "date" | "proceedsGbp" | "adjAnn" | "ghostDeltaGbp";

interface ExitTableProps {
  rows: ExitRow[];
}

export function ExitTable({ rows }: ExitTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "date":
          av = a.date;
          bv = b.date;
          break;
        case "adjAnn":
          av = a.adjAnn ?? -Infinity;
          bv = b.adjAnn ?? -Infinity;
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
  }, [rows, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }


  return (
    <ChartCard title="Exit events" caption="Every sell with post-exit outcomes">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Stock" col="name" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Date" col="date" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Proceeds" col="proceedsGbp" />
              </th>
              <th className="py-2 pr-4 font-normal text-muted">
                <span className="inline-flex items-center gap-1">
                  Raw ann.
                  <MetricTip metric="postExitRaw" />
                </span>
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Adj ann." col="adjAnn" metric="postExitAdjusted" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Kept vs sold" col="ghostDeltaGbp" metric="keptVsSold" />
              </th>
              <th className="py-2 font-normal text-muted">Note</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((row) => (
              <tr key={row.orderIds.join("-")} className="border-b border-border">
                <td className="py-3 pr-4">
                  <Link
                    href={`/stocks/${encodeURIComponent(row.ticker)}`}
                    className="text-ink hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">{formatDate(row.date)}</td>
                <td className="py-3 pr-4">{formatGbp(row.proceedsGbp)}</td>
                <td className={`py-3 pr-4 ${(row.rawAnn ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                  {row.rawAnn != null ? formatPct(row.rawAnn, { signed: true }) : "–"}
                </td>
                <td className={`py-3 pr-4 ${(row.adjAnn ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                  {row.adjAnn != null ? formatPct(row.adjAnn, { signed: true }) : "–"}
                </td>
                <td className={`py-3 pr-4 ${row.ghostDeltaGbp >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatGbp(row.ghostDeltaGbp, { signed: true })}
                </td>
                <td className="py-3 max-w-xs">{row.note || null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
