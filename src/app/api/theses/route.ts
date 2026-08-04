import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listPipelineTheses } from '@/lib/analysis/portfolio';
import { getInstrument, getPrices, insertThesis } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { computeEntryContext } from '@/lib/metrics/entryContext';
import {
  defaultReviewAt,
  serializeEntryContext,
} from '@/lib/theses';

const createSchema = z.object({
  t212_ticker: z.string().nullable().optional(),
  target_weight: z.number().nullable().optional(),
  thesis: z.string().min(1),
  falsifier: z.string().min(1),
});

export async function GET(): Promise<NextResponse> {
  migrate();
  return NextResponse.json({ theses: listPipelineTheses() });
}

export async function POST(request: Request): Promise<NextResponse> {
  migrate();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { t212_ticker, target_weight, thesis, falsifier } = parsed.data;
  const created_at = new Date().toISOString().slice(0, 10);
  const review_at = defaultReviewAt(created_at);

  let entry_context: string | null = null;
  if (t212_ticker) {
    const inst = getInstrument(t212_ticker);
    const yahoo = inst?.yahoo_override ?? inst?.yahoo_symbol;
    if (yahoo) {
      const prices = getPrices(yahoo).map((p) => ({
        date: p.date,
        closeLocal: p.close_local,
      }));
      if (prices.length > 0) {
        entry_context = serializeEntryContext(computeEntryContext(created_at, prices));
      }
    }
  }

  const id = crypto.randomUUID();
  insertThesis({
    id,
    t212_ticker: t212_ticker ?? null,
    created_at,
    status: 'open',
    target_weight: target_weight ?? null,
    thesis,
    falsifier,
    review_at,
    entry_context,
    linked_order_id: null,
    closed_at: null,
    outcome_note: null,
  });

  return NextResponse.json({ id }, { status: 201 });
}
