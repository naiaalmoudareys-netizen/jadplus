/** Home priorities (ADR 0014) and the preferred-visit label (ADR 0013). */
import type { RequestSummary } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems, greeting, openCount, topRequests } from '../src/home/attention.js';
import { arrivalLabel, jobTitle, preferredVisitLabel } from '../src/jobs/format.js';

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

const attention = (requests: RequestSummary[], overdue: string | null = null) =>
  attentionItems({
    requests,
    overdue: overdue === null ? null : { amount: overdue },
    now: NOW,
    label: jobTitle,
    arrival: arrivalLabel,
  });

describe('Home priorities', () => {
  it('greets by the Dubai time of day', () => {
    expect(greeting(NOW)).toBe('Good morning');
    expect(greeting(NOW + 4 * HOUR)).toBe('Good afternoon');
    expect(greeting(NOW + 10 * HOUR)).toBe('Good evening');
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
    expect(preferredVisitLabel(req({ preferredVisit: { date: '2026-11-11', slot: 'morning' } }))).toBe(
      'Preferred: Wed 11 Nov · Morning (9:00 - 12:00)',
    );
    expect(preferredVisitLabel(req({}))).toBeNull();
  });
});
