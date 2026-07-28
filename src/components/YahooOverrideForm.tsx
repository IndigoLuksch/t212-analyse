"use client";

import { useState } from "react";

interface YahooOverrideFormProps {
  ticker: string;
  initialSymbol?: string | null;
}

export function YahooOverrideForm({ ticker, initialSymbol }: YahooOverrideFormProps) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/yahoo-override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, yahooSymbol: symbol.trim() || null }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to save");
        return;
      }
      window.location.reload();
    } catch {
      setError("Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Yahoo symbol:</span>
      <input
        type="text"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="e.g. AAPL"
        className="w-28 rounded border border-border bg-page px-2 py-1 text-ink"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-border px-2 py-1 text-ink-secondary hover:text-ink disabled:opacity-60"
      >
        {busy ? "…" : "Save"}
      </button>
      {error && <span className="text-negative">{error}</span>}
    </form>
  );
}
