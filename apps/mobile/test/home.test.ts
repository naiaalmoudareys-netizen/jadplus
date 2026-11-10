/** Home priorities (ADR 0014) and the preferred-visit label (ADR 0013). */
import type { RequestSummary } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems, greeting, openCount, topRequests } from '../src/home/attention.js';
import { langOf, type Lang } from '../src/i18n/lang.js';
import { arrivalLabel, dayLabel, jobTitle, preferredVisitLabel } from '../src/jobs/format.js';

const en = langOf('en');
const ar = langOf('ar');
const fr = langOf('fr');

const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026
const HOUR = 3_600_000;

const req = (over: Partial<RequestSummary>): RequestSummary => ({
  id: 'r',
  ref: 'JAD-AAAAAA',
  emergency: false,
  emergencyType: null,
  serviceName: 'Maintenance',
  status: 'assigned',
  partnerName: 'Demo Fixers LLC',
  arrivalWindow: null,
  preferredVisit: null,
  location: null,
  createdAt: NOW - HOUR,
  ...over,
});

const attention = (
  requests: RequestSummary[],
  overdue: string | null = null,
  lang: Lang = en,
  owner = true,
) =>
  attentionItems({
    requests,
    overdue: overdue === null ? null : { amount: overdue },
    now: NOW,
    owner,
    t: lang.t,
    label: (r) => jobTitle(r, lang.t),
    arrival: (r) => arrivalLabel(r, lang.t),
  });

describe('Home priorities', () => {
  it('greets by the Dubai time of day', () => {
    expect(greeting(NOW, en.t)).toBe('Good morning');
    expect(greeting(NOW + 4 * HOUR, en.t)).toBe('Good afternoon');
    expect(greeting(NOW + 10 * HOUR, en.t)).toBe('Good evening');
  });

  it('needs attention: an open emergency, a technician today, an overdue payment; nothing when all is fine', () => {
    expect(attention([req({}), req({ status: 'closed' })])).toEqual([]);
    const items = attention(
      [
        req({ id: 'e', emergency: true, emergencyType: 'water_leak' }),
        req({ id: 't', status: 'scheduled', arrivalWindow: { start: NOW + 2 * HOUR, end: NOW + 4 * HOUR } }),
        req({
          id: 'later',
          status: 'scheduled',
          arrivalWindow: { start: NOW + 30 * HOUR, end: NOW + 32 * HOUR },
        }),
      ],
      'AED 245,000',
    );
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['emergency', 'Water leak · emergency'],
      ['arriving', 'Technician today · Maintenance'],
      ['overdue', 'Payment overdue'],
    ]);
    expect(items[0]?.detail).toBe('With Demo Fixers LLC');
  });

  it('ADR 0016: greeting and attention in the chosen language', () => {
    expect(greeting(NOW, ar.t)).toBe('صباح الخير');
    const items = attention(
      [req({ id: 'e', emergency: true, emergencyType: 'water_leak', partnerName: null })],
      'AED 1',
      fr,
    );
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["Fuite d'eau · urgence", 'Pris en charge par JAD+'],
      ['Paiement en retard', 'AED 1'],
    ]);
  });

  it('L4, E10: a quote waiting for the owner, and work waiting to be confirmed', () => {
    const list = [req({ id: 'q', status: 'quote_sent' }), req({ id: 'c', status: 'completed' })];
    expect(attention(list).map((i) => [i.kind, i.title, i.detail])).toEqual([
      ['quote', 'Quote waiting for your approval', 'Maintenance'],
      ['confirm', 'Is the work done?', 'Maintenance'],
    ]);
    expect(attention(list)[0]?.target).toEqual({ requestId: 'q' });
  });

  it('L4: a tenant is not asked to approve a quote, but is asked to confirm the work', () => {
    const list = [req({ id: 'q', status: 'quote_sent' }), req({ id: 'c', status: 'completed' })];
    expect(attention(list, null, en, false).map((i) => i.kind)).toEqual(['confirm']);
    expect(attention(list, null, fr, false)[0]?.title).toBe('Les travaux sont-ils terminés ?');
  });

  it('shows at most two open requests, emergencies first, and counts the open ones', () => {
    const list = [
      req({ id: 'old', createdAt: NOW - 5 * HOUR }),
      req({ id: 'new', createdAt: NOW - HOUR }),
      req({ id: 'emergency', emergency: true, emergencyType: 'lockout', createdAt: NOW - 9 * HOUR }),
      req({ id: 'done', status: 'closed' }),
    ];
    expect(topRequests(list).map((r) => r.id)).toEqual(['emergency', 'new']);
    expect(openCount(list)).toBe(3);
  });
});

describe('preferred visit', () => {
  it('ADR 0013: reads as day and time window', () => {
    expect(preferredVisitLabel(req({ preferredVisit: { date: '2026-11-11', slot: 'morning' } }), en)).toBe(
      'Preferred: Wed 11 Nov · Morning (9:00 - 12:00)',
    );
    expect(preferredVisitLabel(req({}), en)).toBeNull();
    expect(dayLabel('2026-11-10', en.locale)).toBe('Tue 10 Nov');
  });

  it('ADR 0016: day and window in the chosen language, on the same calendar day', () => {
    expect(preferredVisitLabel(req({ preferredVisit: { date: '2026-11-11', slot: 'morning' } }), fr)).toBe(
      'Préférence : mer. 11 nov. · Matin (9:00 - 12:00)',
    );
    expect(dayLabel('2026-11-10', ar.locale)).toBe('الثلاثاء، 10 نوفمبر');
  });
});
