import { NextResponse } from "next/server";
import { getSyncState } from "@/lib/db";

const PROGRESS_KEY = "sync_progress";
const SUMMARY_KEY = "last_sync_summary";

export async function GET(): Promise<NextResponse> {
  let progress: Record<string, unknown> = { phase: "idle", current: 0 };

  const raw = getSyncState(PROGRESS_KEY);
  if (raw) {
    try {
      progress = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* keep default */
    }
  }

  const summaryRaw = getSyncState(SUMMARY_KEY);
  if (summaryRaw) {
    try {
      const summary = JSON.parse(summaryRaw) as { completedAt?: string };
      if (summary.completedAt) {
        progress.lastSyncedAt = summary.completedAt;
      }
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json(progress);
}
