import { NextResponse } from 'next/server';
import { setInstrumentYahooOverride } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { clearMappingForOverride, mapInstrumentToYahoo } from '@/lib/market/mapping';

export async function PUT(request: Request): Promise<NextResponse> {
  migrate();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ticker, yahooSymbol } = body as { ticker?: string; yahooSymbol?: string | null };
  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  setInstrumentYahooOverride(ticker, yahooSymbol ?? null);
  clearMappingForOverride(ticker);
  const result = await mapInstrumentToYahoo(ticker);

  return NextResponse.json({ ok: true, ticker, mapping: result });
}
