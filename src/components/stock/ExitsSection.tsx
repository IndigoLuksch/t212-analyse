"use client";

import { formatDate, formatGbp, formatPct, formatShares } from "@/lib/format/numbers";
import { JournalNote } from "@/components/JournalNote";
import { MetricTip } from "@/components/ui/MetricTip";

interface ExitRow {
  exit: {
    date: string;
    shares: number;
    proceedsGbp: number;
    orderIds: string[];
  };
  post: {
    horizons: { label: string; rawReturn: number; adjustedReturn: number }[];
  };
  ghost: { deltaGbp: number; deltaPct: number };
}

interface ExitsSectionProps {
  exits: ExitRow[];
  notes: Record<string, string>;
}

function PolarityGlyph({ value }: { value: number }) {
  if (value > 0) return <span className="text-positive">▲</span>;
  if (value < 0) return <span className="text-negative">▼</span>;
  return null;
}

export function ExitsSection({ exits, notes }: ExitsSectionProps) {
  if (exits.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium text-ink">Exits</h2>
      <div className="space-y-6">
        {exits.map((row, i) => (
          <div key={`${row.exit.date}-${i}`} className="space-y-2 border-b border-border pb-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-ink">{formatDate(row.exit.date)}</span>
              <span className="text-muted">
                {formatShares(row.exit.shares)} shares · {formatGbp(row.exit.proceedsGbp)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                Raw
                <MetricTip metric="postExitRaw" />
              </span>
              <span className="inline-flex items-center gap-1">
                Adj
                <MetricTip metric="postExitAdjusted" />
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {row.post.horizons.map((h) => (
                <span key={h.label} className="text-ink-secondary">
                  {h.label}{" "}
                  <span className={h.rawReturn >= 0 ? "text-positive" : "text-negative"}>
                    <PolarityGlyph value={h.rawReturn} />
                    {formatPct(h.rawReturn, { signed: true })}
                  </span>
                  {" · "}
                  <span className={h.adjustedReturn >= 0 ? "text-positive" : "text-negative"}>
                    adj {formatPct(h.adjustedReturn, { signed: true })}
                  </span>
                </span>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 text-sm text-ink-secondary">
              Kept vs sold
              <MetricTip metric="keptVsSold" />
              :{" "}
              <span className={row.ghost.deltaGbp >= 0 ? "text-positive" : "text-negative"}>
                {formatGbp(row.ghost.deltaGbp, { signed: true })} (
                {formatPct(row.ghost.deltaPct, { signed: true })})
              </span>
            </div>
            <div className="space-y-1">
              {row.exit.orderIds.map((id) => (
                <JournalNote key={id} orderId={id} initialText={notes[id]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
