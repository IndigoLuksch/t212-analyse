import { describe, expect, it } from 'vitest';
import type { EntryContext } from '@/lib/metrics/entryContext';
import {
  defaultReviewAt,
  parseEntryContext,
  resolveLinkedOrder,
  serializeEntryContext,
  THESIS_REVIEW_DAYS,
} from '@/lib/theses';

describe('defaultReviewAt', () => {
  it('adds 182 days to created_at', () => {
    expect(defaultReviewAt('2024-01-01')).toBe('2024-07-01');
    expect(THESIS_REVIEW_DAYS).toBe(182);
  });

  it('handles ISO timestamps by using date portion', () => {
    expect(defaultReviewAt('2024-06-15T12:00:00.000Z')).toBe('2024-12-14');
  });
});

describe('resolveLinkedOrder', () => {
  const buys = [
    { id: 'early', executedAt: '2024-01-01T10:00:00.000Z' },
    { id: 'on-day', executedAt: '2024-03-15T09:00:00.000Z' },
    { id: 'later', executedAt: '2024-04-01T09:00:00.000Z' },
  ];

  it('picks first BUY on or after created_at', () => {
    expect(resolveLinkedOrder('2024-03-15', buys)).toBe('on-day');
    expect(resolveLinkedOrder('2024-03-15T08:00:00.000Z', buys)).toBe('on-day');
    expect(resolveLinkedOrder('2024-04-01', buys)).toBe('later');
  });

  it('ignores buys before created_at', () => {
    expect(resolveLinkedOrder('2024-03-16', buys)).toBe('later');
    expect(resolveLinkedOrder('2024-05-01', buys)).toBeNull();
  });

  it('returns null when no qualifying buy exists', () => {
    expect(resolveLinkedOrder('2024-01-01', [])).toBeNull();
  });
});

describe('entry context JSON round-trip', () => {
  const ctx: EntryContext = {
    pctFrom52wHigh: -0.12,
    trailing3mReturn: 0.05,
    pctFrom200dma: -0.03,
  };

  it('serialises and parses identically', () => {
    const json = serializeEntryContext(ctx);
    expect(parseEntryContext(json)).toEqual(ctx);
  });

  it('handles null', () => {
    expect(serializeEntryContext(null)).toBeNull();
    expect(parseEntryContext(null)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseEntryContext('not json')).toBeNull();
  });
});
