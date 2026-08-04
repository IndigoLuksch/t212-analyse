import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getThesis, insertThesisReview, updateThesis } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';

const patchSchema = z.object({
  status: z.enum(['open', 'bought', 'abandoned']).optional(),
  outcome_note: z.string().nullable().optional(),
});

const reviewSchema = z.object({
  verdict: z.enum(['intact', 'broken', 'unclear']),
  note: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  migrate();

  const { id } = await context.params;
  const existing = getThesis(id);
  if (!existing) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const patch: Parameters<typeof updateThesis>[1] = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.outcome_note !== undefined) patch.outcome_note = parsed.data.outcome_note;

  if (
    parsed.data.status === 'bought' ||
    parsed.data.status === 'abandoned'
  ) {
    patch.closed_at = new Date().toISOString().slice(0, 10);
  }

  updateThesis(id, patch);
  return NextResponse.json({ ok: true, id });
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  migrate();

  const { id } = await context.params;
  const existing = getThesis(id);
  if (!existing) {
    return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const reviewId = crypto.randomUUID();
  insertThesisReview({
    id: reviewId,
    thesis_id: id,
    reviewed_at: new Date().toISOString(),
    verdict: parsed.data.verdict,
    note: parsed.data.note ?? null,
  });

  return NextResponse.json({ ok: true, id: reviewId }, { status: 201 });
}
