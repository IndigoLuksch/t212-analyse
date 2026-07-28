"use client";

import { useState } from "react";

export function EmptyState() {
  const [busy, setBusy] = useState(false);

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/sync", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <p className="text-ink-secondary">Sync your Trading 212 account to begin.</p>
      <button
        type="button"
        onClick={() => void syncNow()}
        disabled={busy}
        className="rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink hover:bg-page disabled:opacity-60"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
