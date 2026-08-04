"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MetricTip } from "@/components/ui/MetricTip";
import { formatPct } from "@/lib/format/numbers";
import type { EntryContext } from "@/lib/metrics/entryContext";

type Instrument = { ticker: string; name: string };

type ThesisApiRow = {
  id: string;
  t212_ticker: string | null;
  created_at: string;
  status: "open" | "bought" | "abandoned";
  target_weight: number | null;
  thesis: string;
  falsifier: string;
  review_at: string;
  entry_context: EntryContext | null;
  linked_order_id: string | null;
  closed_at: string | null;
  outcome_note: string | null;
  due: boolean;
  days_until_review: number;
  linked_adj: LinkedAdj | null;
};

type LinkedAdj = {
  adj90: number | null;
  adj182: number | null;
  adj365: number | null;
};

function score(q: string, inst: Instrument): number {
  const n = inst.name.toLowerCase();
  const t = inst.ticker.toLowerCase();
  const s = q.toLowerCase().trim();
  if (!s) return 0;
  if (t === s || n === s) return 100;
  if (t.startsWith(s) || n.startsWith(s)) return 80;
  if (t.includes(s) || n.includes(s)) return 50;
  let i = 0;
  for (const ch of n + " " + t) {
    if (ch === s[i]) i++;
    if (i >= s.length) return 30;
  }
  return 0;
}

function formatEntryContext(ctx: EntryContext | null): string | null {
  if (!ctx) return null;
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

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "1 day until review";
  return `${days} days until review`;
}

function TickerCombobox({
  instruments,
  value,
  onChange,
}: {
  instruments: Instrument[];
  value: string;
  onChange: (ticker: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return instruments.slice(0, 8);
    return instruments
      .map((inst) => ({ inst, s: score(q, inst) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.inst);
  }, [instruments, q]);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm text-muted">Ticker (optional)</label>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search or type ticker…"
        className="w-full border border-border bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto border border-border bg-surface">
          {results.map((inst) => (
            <li key={inst.ticker}>
              <button
                type="button"
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-page"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ(inst.ticker);
                  onChange(inst.ticker);
                  setOpen(false);
                }}
              >
                <span className="text-muted">{inst.ticker}</span>
                <span className="text-ink">{inst.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThesisRow({
  row,
  linkedAdj,
  onReview,
  showDays,
}: {
  row: ThesisApiRow;
  linkedAdj?: LinkedAdj | null;
  onReview: (id: string, verdict: "intact" | "broken" | "unclear") => void;
  showDays?: boolean;
}) {
  const context = formatEntryContext(row.entry_context);
  const [submitting, setSubmitting] = useState(false);

  async function submitVerdict(verdict: "intact" | "broken" | "unclear") {
    setSubmitting(true);
    try {
      await onReview(row.id, verdict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2 border-b border-border pb-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        {row.t212_ticker ? (
          <Link
            href={`/stocks/${encodeURIComponent(row.t212_ticker)}`}
            className="font-medium text-ink hover:underline"
          >
            {row.t212_ticker}
          </Link>
        ) : (
          <span className="font-medium text-ink">No ticker</span>
        )}
        {row.target_weight != null && (
          <span className="text-muted">target {formatPct(row.target_weight)}</span>
        )}
        {showDays && (
          <span className="text-muted">{daysLabel(row.days_until_review)}</span>
        )}
      </div>
      <p className="text-sm text-ink">
        <span className="text-muted">Thesis:</span> {row.thesis}
      </p>
      <p className="text-sm text-ink-secondary">
        <span className="text-muted">Falsifier:</span> {row.falsifier}
      </p>
      {context && (
        <p className="text-sm text-ink-secondary">
          <span className="inline-flex items-center gap-1">
            Entry context
            <MetricTip metric="entryContext" />
          </span>
          : {context}
        </p>
      )}
      {row.linked_order_id && (
        <div className="text-sm text-ink-secondary">
          {linkedAdj ? (
            <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Linked buy{" "}
                <Link
                  href={`/stocks/${encodeURIComponent(row.t212_ticker ?? "")}`}
                  className="text-ink hover:underline"
                >
                  {row.linked_order_id}
                </Link>
              </span>
              <span>
                Adj 3m{" "}
                {linkedAdj.adj90 != null ? (
                  <span className={linkedAdj.adj90 >= 0 ? "text-positive" : "text-negative"}>
                    {formatPct(linkedAdj.adj90, { signed: true })}
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </span>
              <span>
                Adj 6m{" "}
                {linkedAdj.adj182 != null ? (
                  <span className={linkedAdj.adj182 >= 0 ? "text-positive" : "text-negative"}>
                    {formatPct(linkedAdj.adj182, { signed: true })}
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </span>
              <span>
                Adj 1y{" "}
                {linkedAdj.adj365 != null ? (
                  <span className={linkedAdj.adj365 >= 0 ? "text-positive" : "text-negative"}>
                    {formatPct(linkedAdj.adj365, { signed: true })}
                  </span>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </span>
            </span>
          ) : (
            <span>
              Linked order{" "}
              <span className="text-ink">{row.linked_order_id}</span>
            </span>
          )}
        </div>
      )}
      {row.due && row.status === "open" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {(["intact", "broken", "unclear"] as const).map((verdict) => (
            <button
              key={verdict}
              type="button"
              disabled={submitting}
              onClick={() => submitVerdict(verdict)}
              className="border border-border px-3 py-1 text-sm text-ink hover:bg-page disabled:opacity-50"
            >
              {verdict}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineClient({
  instruments,
  initialTheses,
}: {
  instruments: Instrument[];
  initialTheses: ThesisApiRow[];
}) {
  const router = useRouter();
  const [theses, setTheses] = useState<ThesisApiRow[]>(initialTheses);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ticker, setTicker] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [thesisText, setThesisText] = useState("");
  const [falsifier, setFalsifier] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTheses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/theses");
      if (!res.ok) throw new Error("Failed to load theses");
      const data = (await res.json()) as { theses: ThesisApiRow[] };
      setTheses(data.theses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const due = useMemo(
    () => theses.filter((t) => t.due && t.status === "open"),
    [theses],
  );
  const open = useMemo(
    () => theses.filter((t) => !t.due && t.status === "open"),
    [theses],
  );

  async function handleReview(id: string, verdict: "intact" | "broken" | "unclear") {
    const res = await fetch(`/api/theses/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    if (!res.ok) throw new Error("Failed to submit review");
    router.refresh();
    await loadTheses();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!thesisText.trim() || !falsifier.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        thesis: thesisText.trim(),
        falsifier: falsifier.trim(),
      };
      if (ticker.trim()) body.t212_ticker = ticker.trim();
      if (targetWeight.trim()) {
        const w = parseFloat(targetWeight);
        if (!Number.isNaN(w)) body.target_weight = w;
      }

      const res = await fetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create thesis");
      }

      setTicker("");
      setTargetWeight("");
      setThesisText("");
      setFalsifier("");
      router.refresh();
      await loadTheses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-negative">{error}</p>}

      {due.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-ink">Due for review</h3>
          <div className="space-y-6">
            {due.map((row) => (
              <ThesisRow
                key={row.id}
                row={row}
                linkedAdj={row.linked_adj}
                onReview={handleReview}
              />
            ))}
          </div>
        </section>
      )}

      {open.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-ink">Open theses</h3>
          <div className="space-y-6">
            {open.map((row) => (
              <ThesisRow
                key={row.id}
                row={row}
                linkedAdj={row.linked_adj}
                onReview={handleReview}
                showDays
              />
            ))}
          </div>
        </section>
      )}

      {due.length === 0 && open.length === 0 && (
        <p className="text-sm text-muted">No open theses yet.</p>
      )}

      <section className="space-y-4 border-t border-border pt-8">
        <h3 className="text-sm font-medium text-ink">New thesis</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <TickerCombobox instruments={instruments} value={ticker} onChange={setTicker} />
          <div>
            <label className="mb-1 block text-sm text-muted">Target weight (optional)</label>
            <input
              type="text"
              inputMode="decimal"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="e.g. 0.05 for 5%"
              className="w-full border border-border bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Thesis</label>
            <textarea
              value={thesisText}
              onChange={(e) => setThesisText(e.target.value)}
              rows={3}
              required
              className="w-full border border-border bg-transparent px-3 py-2 text-sm text-ink outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Falsifier</label>
            <textarea
              value={falsifier}
              onChange={(e) => setFalsifier(e.target.value)}
              rows={2}
              required
              placeholder="What would prove this wrong?"
              className="w-full border border-border bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !thesisText.trim() || !falsifier.trim()}
            className="border border-border px-4 py-2 text-sm text-ink hover:bg-page disabled:opacity-50"
          >
            {creating ? "Saving…" : "Add thesis"}
          </button>
        </form>
      </section>
    </div>
  );
}
