"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Instrument = { ticker: string; name: string };

function score(q: string, inst: Instrument): number {
  const n = inst.name.toLowerCase();
  const t = inst.ticker.toLowerCase();
  const s = q.toLowerCase().trim();
  if (!s) return 0;
  if (t === s || n === s) return 100;
  if (t.startsWith(s) || n.startsWith(s)) return 80;
  if (t.includes(s) || n.includes(s)) return 50;
  // fuzzy: all chars in order
  let i = 0;
  for (const ch of n + " " + t) {
    if (ch === s[i]) i++;
    if (i >= s.length) return 30;
  }
  return 0;
}

export function StockSwitcher({ instruments }: { instruments: Instrument[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    if (!q.trim()) return instruments.slice(0, 12);
    return instruments
      .map((inst) => ({ inst, s: score(q, inst) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.inst);
  }, [instruments, q]);

  // Clearing the query belongs with the act of opening, not with an effect that
  // watches `open` — an effect would blank whatever the user has already typed
  // on any unrelated re-render that flips `open` back to true.
  const openSwitcher = useCallback(() => {
    setQ("");
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSwitcher();
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSwitcher]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={openSwitcher}
        className="rounded px-2 py-1 text-[13px] text-muted hover:text-ink-secondary"
      >
        ⌘K
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-md border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stocks…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-muted">No matches</li>
          ) : (
            results.map((inst) => (
              <li key={inst.ticker}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-3 px-4 py-2 text-left hover:bg-page"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/stocks/${encodeURIComponent(inst.ticker)}`);
                  }}
                >
                  <span className="text-[13px] text-muted">{inst.ticker}</span>
                  <span className="text-[14px] text-ink">{inst.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
