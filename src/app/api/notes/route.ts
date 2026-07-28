import { NextResponse } from 'next/server';
import { upsertNote } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';

export async function PUT(request: Request): Promise<NextResponse> {
  migrate();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderId, text } = body as { orderId?: string; text?: string };
  if (!orderId || typeof text !== 'string') {
    return NextResponse.json({ error: 'orderId and text are required' }, { status: 400 });
  }

  upsertNote(orderId, text);
  return NextResponse.json({ ok: true, orderId });
}
