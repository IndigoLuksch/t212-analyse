import { NextResponse } from 'next/server';
import { getSyncState, setSyncState } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { runMarketSync } from '@/lib/market/sync';
import { createFxLookup } from '@/lib/market/fx';
import { runT212Sync, type SyncProgress } from '@/lib/t212/sync';

const PROGRESS_KEY = 'sync_progress';

function saveProgress(progress: SyncProgress & { status?: string }): void {
  setSyncState(PROGRESS_KEY, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }));
}

export async function POST(): Promise<NextResponse> {
  migrate();
  saveProgress({ phase: 'starting', current: 0, status: 'running' });

  try {
    const fxLookup = createFxLookup();
    const t212Summary = await runT212Sync((progress) => {
      saveProgress({ ...progress, status: 'running' });
    }, fxLookup);

    const marketSummary = await runMarketSync((progress) => {
      saveProgress({ ...progress, status: 'running' });
    });

    const summary = {
      status: 'complete',
      t212: t212Summary,
      market: marketSummary,
      completedAt: new Date().toISOString(),
    };
    saveProgress({ phase: 'done', current: 1, total: 1, status: 'complete' });
    setSyncState('last_sync_summary', JSON.stringify(summary));

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    saveProgress({ phase: 'error', current: 0, status: 'error' });
    setSyncState('last_sync_error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
