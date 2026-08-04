"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Read by the poll timer, which outlives any one render's closure.
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/progress");
      if (!res.ok) return;
      const data = (await res.json()) as Progress;
      setProgress(data);
      setBusy(isRunning(data));
      busyRef.current = isRunning(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Both the first read and the poll go through a timer: the effect itself
    // stays a pure subscription, and the interval survives busy flipping.
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => {
      if (busyRef.current) void refresh();
    }, 800);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    busyRef.current = true;
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
