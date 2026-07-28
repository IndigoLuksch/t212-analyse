"use client";

import { useCallback, useEffect, useState } from "react";
import { relativeTime } from "@/lib/format/numbers";

type Progress = {
  phase?: string;
  current?: number;
  total?: number;
  status?: string;
  running?: boolean;
  lastSyncedAt?: string | null;
  message?: string;
};

function isRunning(data: Progress): boolean {
  return data.status === "running" || Boolean(data.running);
}

export function SyncPill() {
  const [progress, setProgress] = useState<Progress>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/progress");
      if (!res.ok) return;
      const data = (await res.json()) as Progress;
      setProgress(data);
      setBusy(isRunning(data));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (busy) void refresh();
    }, 800);
    return () => clearInterval(id);
  }, [busy, refresh]);

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    setProgress((p) => ({ ...p, status: "running", phase: "starting", current: 0 }));
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch {
      /* surfaced via progress */
    } finally {
      await refresh();
    }
  }

  const label = busy
    ? progress.phase
      ? progress.total != null
        ? `${progress.phase} ${progress.current ?? 0}/${progress.total}`
        : `${progress.phase} ${progress.current ?? 0}/～`
      : "syncing…"
    : `synced ${relativeTime(progress.lastSyncedAt)}`;

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={busy}
      className="rounded px-2 py-1 text-[13px] text-muted hover:text-ink-secondary disabled:opacity-70"
      title="Sync now"
    >
      {label}
    </button>
  );
}
