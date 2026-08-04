"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts";
import { SortHeader } from "@/components/ui/SortHeader";
import type { BuyRow } from "@/lib/analysis/buyingTypes";
import { formatDate, formatGbp, formatPct } from "@/lib/format/numbers";

export type { BuyRow };

type SortKey = "name" | "date" | "capitalGbp" | "classification" | "adj365";

interface BuyTableProps {
  rows: BuyRow[];
}

function classificationLabel(c: BuyRow["classification"]): string {
  if (c === "base") return "base";
  if (c === "up") return "averaging up";
  return "averaging down";
}

export function BuyTable({ rows }: BuyTableProps) {
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
        case "classification":
          av = a.classification;
          bv = b.classification;
          break;
        case "adj365":
          av = a.adj365 ?? -Infinity;
          bv = b.adj365 ?? -Infinity;
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
    <ChartCard title="Buy events" caption="Every buy with post-buy outcomes">
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
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Capital" col="capitalGbp" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Class" col="classification" metric="trancheClass" />
              </th>
              <th className="py-2 pr-4 font-normal">
                <SortHeader sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} label="Adj 1y" col="adj365" metric="postBuyAdj" />
              </th>
              <th className="py-2 font-normal text-muted">Note</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((row) => (
              <tr key={row.orderId} className="border-b border-border">
                <td className="py-3 pr-4">
                  <Link
                    href={`/stocks/${encodeURIComponent(row.ticker)}`}
                    className="text-ink hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">{formatDate(row.date)}</td>
                <td className="py-3 pr-4">{formatGbp(row.capitalGbp)}</td>
                <td className="py-3 pr-4">
                  <span className="rounded bg-page px-1.5 py-0.5 text-[11px] text-muted">
                    {classificationLabel(row.classification)}
                  </span>
                </td>
                <td className={`py-3 pr-4 ${(row.adj365 ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                  {row.adj365 != null ? formatPct(row.adj365, { signed: true }) : "–"}
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
