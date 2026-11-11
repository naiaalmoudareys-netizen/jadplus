// JAD+ Admin console logic (ADR 0025): sorting, formatting, dates, labels, request actions, the timeline and
// the partner paperwork helpers.
import { describe, expect, it } from 'vitest';
import { dayEnd, dayStart, dubaiInstant, shiftDay, today, weekdayName, weekdayOf } from '../src/lib/dates';
import {
  bytesText,
  fils,
  humanize,
  minutesText,
  monthText,
  percentText,
  shiftMonth,
  starsText,
} from '../src/lib/format';
import { eventLabel, label, ROLE_LABELS, serviceName } from '../src/lib/labels';
import { forPartner, priceChange } from '../src/lib/partner-admin';
import { adminRequestActions } from '../src/lib/request-actions';
import { nextSort, sortRows } from '../src/lib/sort';
import { eventDetail } from '../src/lib/timeline';

// 10 Nov 2026, 12:00 in Dubai (08:00 UTC).
const NOW = Date.UTC(2026, 10, 10, 8, 0);

describe('table sorting', () => {
  const rows = [
    { name: 'Beta', jobs: 3 },
    { name: 'alpha', jobs: null },
    { name: 'Gamma', jobs: 10 },
    { name: 'delta', jobs: 3 },
  ];
  const value = (r: (typeof rows)[number], key: 'name' | 'jobs') => r[key];

  it('sorts text without minding case and numbers as numbers; empty values always last', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, value).map((r) => r.name)).toEqual([
      'alpha',
      'Beta',
      'delta',
      'Gamma',
    ]);
    expect(sortRows(rows, { key: 'jobs', dir: 'asc' }, value).map((r) => r.jobs)).toEqual([3, 3, 10, null]);
    expect(sortRows(rows, { key: 'jobs', dir: 'desc' }, value).map((r) => r.jobs)).toEqual([10, 3, 3, null]);
  });

  it('keeps equal rows in their order (stable), and leaves the input untouched', () => {
    expect(sortRows(rows, { key: 'jobs', dir: 'desc' }, value).map((r) => r.name)).toEqual([
      'Gamma',
      'Beta',
      'delta',
      'alpha',
    ]);
    expect(rows[0]?.name).toBe('Beta');
  });

  it('a click on the same column reverses it; another column starts ascending', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort<'name' | 'jobs'>({ key: 'name', dir: 'desc' }, 'jobs')).toEqual({
      key: 'jobs',
      dir: 'asc',
    });
  });
});

describe('figures and months', () => {
  it('S5: money in fils, percentages and ratings; "—" when nothing was measured', () => {
    expect(fils(125_050)).toBe('AED 1,250.50');
    expect(fils(30_000)).toBe('AED 300');
    expect(percentText(92.5)).toBe('92.5 %');
    expect(percentText(null)).toBe('—');
    expect(starsText(4.25)).toBe('4.3 / 5');
    expect(starsText(null)).toBe('—');
    expect(minutesText(150)).toBe('2 h 30 min');
    expect(minutesText(null)).toBe('—');
  });

  it('names months and moves between them across the year end', () => {
    expect(monthText('2026-11')).toBe('November 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('turns codes into words and sizes into KB or MB', () => {
    expect(humanize('partner_document_accepted')).toBe('Partner document accepted');
    expect(humanize('windowStart')).toBe('Window start');
    expect(bytesText(350 * 1024)).toBe('350 KB');
    expect(bytesText(15 * 1024 * 1024)).toBe('15.0 MB');
    expect(bytesText(10)).toBe('1 KB');
  });
});

describe('Dubai dates (UTC+4, whatever the computer’s zone)', () => {
  it('reads a Dubai date and time as an instant', () => {
    expect(dubaiInstant('2026-11-12', '14:30')).toBe(Date.UTC(2026, 10, 12, 10, 30));
    expect(dubaiInstant('2026-11-12', '24:00')).toBeNull();
    expect(dubaiInstant('12/11/2026', '14:30')).toBeNull();
    expect(dayStart('2026-11-12')).toBe(Date.UTC(2026, 10, 11, 20, 0));
    expect(dayEnd('2026-11-12')).toBe(Date.UTC(2026, 10, 12, 20, 0));
    expect(dayStart('not a day')).toBeNull();
  });

  it('knows today in Dubai, the days around it and their names', () => {
    expect(today(NOW)).toBe('2026-11-10');
    // 22:30 UTC on 10 Nov is already 11 Nov in Dubai.
    expect(today(Date.UTC(2026, 10, 10, 22, 30))).toBe('2026-11-11');
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(weekdayOf('2026-11-10')).toBe('Tuesday');
    expect(weekdayName(5)).toBe('Friday');
  });
});

describe('labels', () => {
  it('names roles, events and services, with a readable fallback for unknown codes', () => {
    expect(label(ROLE_LABELS, 'jad_viewer')).toBe('JAD+ viewer (read only)');
    expect(label(ROLE_LABELS, 'auditor')).toBe('Auditor');
    expect(eventLabel('visit_booked')).toBe('Visit booked');
    expect(eventLabel('something_new')).toBe('Something new');
    expect(serviceName('maintenance')).toBe('Maintenance');
    expect(serviceName('pool_cleaning')).toBe('Pool cleaning');
  });
});

describe('request actions for JAD+ Admin (ADR 0025)', () => {
  it('E6: a request with or without a partner can be moved while it is open; never once closed', () => {
    expect(adminRequestActions('assigned', false, true).reassign).toBe(true);
    expect(adminRequestActions('submitted', false, true).reassign).toBe(true);
    expect(adminRequestActions('closed', false, true).reassign).toBe(false);
    expect(adminRequestActions('cancelled', true, true).reassign).toBe(false);
  });

  it('E13: only an open emergency can be reclassified as routine', () => {
    expect(adminRequestActions('assigned', true, true).reclassify).toBe(true);
    expect(adminRequestActions('assigned', false, true).reclassify).toBe(false);
    expect(adminRequestActions('closed', true, true).reclassify).toBe(false);
  });

  it('a closed or cancelled request cannot be cancelled again', () => {
    expect(adminRequestActions('scheduled', false, true).cancel).toBe(true);
    expect(adminRequestActions('closed', false, true).cancel).toBe(false);
    expect(adminRequestActions('cancelled', false, true).cancel).toBe(false);
  });

  it('ADR 0030: only a waiting routine request with no provider can be marked as handled by JAD+', () => {
    expect(adminRequestActions('submitted', false, false).handled).toBe(true);
    expect(adminRequestActions('submitted', false, true).handled).toBe(false);
    expect(adminRequestActions('submitted', true, false).handled).toBe(false);
    expect(adminRequestActions('completed', false, false).handled).toBe(false);
  });
});

describe('request timeline (ADR 0025)', () => {
  it('shows the facts recorded with a step, without internal ids, times in Dubai', () => {
    expect(
      eventDetail({
        visit: 'v1',
        technicianId: 't1',
        windowStart: Date.UTC(2026, 10, 12, 6, 0),
        revision: 2,
      }),
    ).toBe('Window start: 12 Nov 2026, 10:00 · Revision: 2');
    expect(eventDetail({ id: 'x', note: 'n1' })).toBeNull();
    expect(eventDetail({ emergency: true, reason: null })).toBe('Emergency: true');
    expect(eventDetail(null)).toBeNull();
  });
});

describe('partner paperwork (S7, S9, P1)', () => {
  it('S9: compares a proposed price with today’s card', () => {
    expect(priceChange(11_250, 10_000)).toEqual({ text: '+12.5 %', tone: 'warn' });
    expect(priceChange(9_600, 10_000)).toEqual({ text: '-4 %', tone: 'good' });
    expect(priceChange(10_000, 10_000)).toEqual({ text: 'No change', tone: 'calm' });
    expect(priceChange(10_000, null)).toEqual({ text: 'New line', tone: 'calm' });
  });

  it('S7: one partner’s items, waiting ones first, then the latest decisions', () => {
    const items = [
      { id: 'a', partnerId: 'p1', status: 'accepted' as const, decidedAt: 100 },
      { id: 'b', partnerId: 'p2', status: 'pending' as const, decidedAt: null },
      { id: 'c', partnerId: 'p1', status: 'rejected' as const, decidedAt: 300 },
      { id: 'd', partnerId: 'p1', status: 'pending' as const, decidedAt: null },
    ];
    expect(forPartner(items, 'p1').map((i) => i.id)).toEqual(['d', 'c', 'a']);
    expect(forPartner(items, 'p3')).toEqual([]);
  });
});
