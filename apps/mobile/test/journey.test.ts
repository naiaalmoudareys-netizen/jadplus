/** The request journey screens (ADR 0018): visit windows a partner can book, quote amounts, wording. */
import { visitWindowAllowed } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { jobStatusLabel } from '../src/jobs/format.js';
import {
  parseAed,
  quoteStatusLabel,
  slotOpen,
  slotWindow,
  validUntilLabel,
  visitDays,
  visitLabel,
} from '../src/jobs/journey.js';
import { langOf } from '../src/i18n/lang.js';

const en = langOf('en');
const fr = langOf('fr');
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026

describe('booking a visit', () => {
  it('a slot on a Dubai date is a 3-hour window in Dubai time (UTC+4)', () => {
    expect(slotWindow('2026-11-11', 'morning')).toEqual({
      windowStart: Date.UTC(2026, 10, 11, 5, 0),
      windowEnd: Date.UTC(2026, 10, 11, 8, 0),
    });
    expect(slotWindow('2026-11-11', 'afternoon')).toEqual({
      windowStart: Date.UTC(2026, 10, 11, 11, 0),
      windowEnd: Date.UTC(2026, 10, 11, 14, 0),
    });
    const w = slotWindow('2026-11-11', 'midday');
    expect(visitWindowAllowed(w.windowStart, w.windowEnd, NOW)).toBe(true);
  });

  it('skips windows already started today and days beyond 30 days', () => {
    expect(slotOpen('2026-11-10', 'morning', NOW)).toBe(false);
    expect(slotOpen('2026-11-10', 'midday', NOW)).toBe(true);
    expect(slotOpen('2026-12-20', 'morning', NOW)).toBe(false);
  });

  it('offers today while a window is left, the next working days and the preferred day', () => {
    const days = visitDays(NOW, null);
    expect(days[0]).toBe('2026-11-10');
    expect(days.slice(1, 5)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']);
    expect(visitDays(NOW + 9 * HOUR, null)[0]).toBe('2026-11-11');
    expect(visitDays(NOW, '2026-11-14')).toContain('2026-11-14');
    expect(visitDays(NOW, '2026-11-09')).not.toContain('2026-11-09');
  });
});

describe('quote amount', () => {
  it('L4: a positive AED amount with at most two decimals', () => {
    expect(parseAed('1250')).toBe(1250);
    expect(parseAed(' 99.5 ')).toBe(99.5);
    expect(parseAed('99,95')).toBe(99.95);
    for (const bad of ['', '0', '0.00', '-5', '1.234', '1,250.00', 'abc', '20000000']) {
      expect(parseAed(bad), bad).toBeNull();
    }
  });
});

describe('journey wording', () => {
  const visit = {
    start: Date.UTC(2026, 10, 11, 5, 0),
    end: Date.UTC(2026, 10, 11, 8, 0),
    technician: 'Sam',
    status: 'booked' as const,
  };
  const quote = {
    id: 'q',
    revision: 1,
    amountAed: 1250,
    scope: 'Replace the valve',
    status: 'pending' as const,
    sentAt: NOW,
    expiresAt: NOW + 14 * 24 * HOUR,
  };

  it('a visit reads as day and Dubai window', () => {
    expect(visitLabel(visit, en)).toBe('Wed 11 Nov · 09:00-12:00');
  });

  it('A2: a quote shows until when it is valid and where it stands', () => {
    expect(validUntilLabel(quote, en)).toBe('Valid until 24 Nov 2026');
    expect(quoteStatusLabel('pending', en.t)).toBe('Waiting for the owner');
    expect(quoteStatusLabel('declined', fr.t)).toBe('Refusé par le propriétaire');
  });

  it('a routine job waiting for its visit reads in plain words; an emergency still asks to acknowledge', () => {
    expect(jobStatusLabel({ status: 'assigned', emergency: false }, en.t)).toBe('New: book a visit');
    expect(jobStatusLabel({ status: 'assigned', emergency: true }, en.t)).toBe('New: acknowledge');
    expect(jobStatusLabel({ status: 'in_progress', emergency: false }, en.t)).toBe('In progress');
  });
});
