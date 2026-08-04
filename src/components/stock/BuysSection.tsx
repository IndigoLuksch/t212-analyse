"use client";

import { formatDate, formatGbp, formatPct } from "@/lib/format/numbers";
import { JournalNote } from "@/components/JournalNote";
import { MetricTip } from "@/components/ui/MetricTip";
import type { StockBuyRow } from "@/lib/analysis/buyingTypes";

interface BuysSectionProps {
  buys: StockBuyRow[];
  notes: Record<string, string>;
}

function PolarityGlyph({ value }: { value: number }) {
  if (value > 0) return <span className="text-positive">▲</span>;
  if (value < 0) return <span className="text-negative">▼</span>;
  return null;
}

function classificationLabel(c: StockBuyRow["classification"]): string {
  if (c === "base") return "base";
  if (c === "up") return "averaging up";
  return "averaging down";
}

function formatEntryContext(ctx: StockBuyRow["entryContext"]): string | null {
  const parts: string[] = [];
  if (ctx.pctFrom52wHigh != null) {
    parts.push(`${formatPct(ctx.pctFrom52wHigh, { signed: true })} from 52w high`);
  }
  if (ctx.trailing3mReturn != null) {
    parts.push(`${formatPct(ctx.trailing3mReturn, { signed: true })} trailing 3m`);
  }
  if (ctx.pctFrom200dma != null) {
    parts.push(`${formatPct(ctx.pctFrom200dma, { signed: true })} vs 200dma`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function AdjHorizon({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <MetricTip metric="postBuyAdj" />
      {value != null ? (
        <span className={value >= 0 ? "text-positive" : "text-negative"}>
          <PolarityGlyph value={value} />
          {formatPct(value, { signed: true })}
        </span>
      ) : (
        <span className="text-muted">–</span>
      )}
    </span>
  );
}

export function BuysSection({ buys, notes }: BuysSectionProps) {
  if (buys.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium text-ink">Buys</h2>
      <div className="space-y-6">
        {buys.map((row) => {
          const context = formatEntryContext(row.entryContext);
          return (
            <div key={row.orderId} className="space-y-2 border-b border-border pb-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-ink">{formatDate(row.date)}</span>
                <span className="text-muted">{formatGbp(row.capitalGbp)}</span>
                <span className="rounded bg-page px-1.5 py-0.5 text-[11px] text-muted">
                  {classificationLabel(row.classification)}
                </span>
              </div>
              {context && (
                <p className="text-sm text-ink-secondary">
                  <span className="inline-flex items-center gap-1">
                    Entry context
                    <MetricTip metric="entryContext" />
                  </span>
                  : {context}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary">
                <AdjHorizon label="Adj 3m" value={row.adj90} />
                <AdjHorizon label="Adj 6m" value={row.adj182} />
                <AdjHorizon label="Adj 1y" value={row.adj365} />
              </div>
              <div className="space-y-1">
                <JournalNote orderId={row.orderId} initialText={notes[row.orderId]} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
