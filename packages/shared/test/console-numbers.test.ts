/** Console numbers and lookups: per-technician figures (S5, S6), the request clock (S4, E4), audit person lookup. */
import { describe, expect, it } from 'vitest';
import {
  PARTNER_TARGETS,
  adminAuditQuery,
  auditPersonLookup,
  requestClock,
  technicianFigures,
  technicianStatsPeriod,
  technicianStatsQuery,
  type TechnicianFacts,
} from '../src/index.js';

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 11, 8, 0, 0);
const TEAM = [
  { id: 't1', name: 'Technician One' },
  { id: 't2', name: 'Technician Two' },
];
const NONE: TechnicianFacts = { done: [], outcomes: [], ratings: [], repeatVisits: [], open: [] };
const t = (technicianId: string | null) => ({ technicianId });

describe('per-technician numbers (S5, S6)', () => {
  it('S5: each technician gets only the facts of jobs assigned to them', () => {
    const [one, two] = technicianFigures(TEAM, {
      done: [t('t1'), t('t1'), t('t2'), t(null)],
      outcomes: [
        { ...t('t1'), outcome: 'met' },
        { ...t('t1'), outcome: 'missed' },
        { ...t('t2'), outcome: 'met' },
      ],
      ratings: [
        { ...t('t1'), stars: 5 },
        { ...t('t1'), stars: 4 },
        { ...t('t2'), stars: 3 },
      ],
      repeatVisits: [t('t1')],
      open: [t('t2'), t('t2'), t('t-removed')],
    });
    expect(one).toMatchObject({
      technicianId: 't1',
      name: 'Technician One',
      jobsDone: 2,
      onTime: { met: 1, total: 2 },
      onTimePercent: 50,
      rating: { average: 4.5, count: 2 },
      repeatVisits: 1,
      repeatVisitPercent: 50,
      openJobs: 0,
      meets: { onTime: false, rating: true, repeatVisits: false },
    });
    expect(two).toMatchObject({ jobsDone: 1, onTimePercent: 100, openJobs: 2 });
    expect(two?.meets).toEqual({ onTime: true, rating: false, repeatVisits: true });
  });

  it('S5: no data is "no data", never a made-up 100 %', () => {
    const [one] = technicianFigures(TEAM, NONE);
    expect(one).toMatchObject({
      jobsDone: 0,
      onTimePercent: null,
      rating: { average: null, count: 0 },
      repeatVisitPercent: null,
      meets: { onTime: null, rating: null, repeatVisits: null },
    });
  });

  it('S6: excused targets (no access, A7) are not held against the technician', () => {
    const [one] = technicianFigures(TEAM, {
      ...NONE,
      outcomes: [
        { ...t('t1'), outcome: 'met' },
        { ...t('t1'), outcome: 'excused' },
      ],
    });
    expect(one?.onTime).toEqual({ met: 1, total: 1 });
    expect(one?.meets.onTime).toBe(true);
  });

  it('S6: the rating line is the 4.0 review line, met exactly at 4.0', () => {
    const [one] = technicianFigures(TEAM, { ...NONE, ratings: [{ ...t('t1'), stars: 4 }] });
    expect(PARTNER_TARGETS.averageRating).toBe(4);
    expect(one?.meets.rating).toBe(true);
  });

  it('S5: the period is a Dubai month, or the 30 days up to now', () => {
    expect(technicianStatsPeriod('2026-11', NOW)).toEqual({
      start: Date.UTC(2026, 9, 31, 20),
      end: Date.UTC(2026, 10, 30, 20),
    });
    expect(technicianStatsPeriod(null, NOW)).toEqual({ start: NOW - 30 * DAY, end: NOW + 1 });
    expect(technicianStatsQuery.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(technicianStatsQuery.safeParse({ days: '30' }).success).toBe(false);
  });
});

describe('request clock (S4, E4)', () => {
  const base = {
    status: 'assigned' as const,
    isEmergency: true,
    acknowledgedAt: null,
    firstVisitBookedAt: null,
    nextDueAt: NOW + 10 * MIN,
    nextDueKind: 'emergency_ack',
  };

  it('E4: an emergency not acknowledged shows the minutes left on the 15-minute clock', () => {
    expect(requestClock(base, NOW)).toEqual({
      acknowledged: false,
      acknowledgedAt: null,
      nextDueAt: NOW + 10 * MIN,
      nextDueKind: 'emergency_ack',
      minutesLeft: 10,
      paused: false,
    });
  });

  it('E4: late is negative, and never shows 0 minutes once past', () => {
    expect(requestClock(base, NOW + 10 * MIN + 1).minutesLeft).toBe(-1);
  });

  it('E4: an acknowledged emergency is acknowledged at acknowledged_at, not by a visit booking', () => {
    const c = requestClock({ ...base, acknowledgedAt: NOW - MIN, firstVisitBookedAt: NOW }, NOW);
    expect([c.acknowledged, c.acknowledgedAt]).toEqual([true, NOW - MIN]);
  });

  it('S4: a routine request is answered when the visit is first booked', () => {
    const routine = { ...base, isEmergency: false, nextDueKind: 'routine_response' };
    expect(requestClock(routine, NOW).acknowledged).toBe(false);
    expect(requestClock({ ...routine, firstVisitBookedAt: NOW - DAY }, NOW).acknowledgedAt).toBe(NOW - DAY);
  });

  it('A6: the clock shows paused while on hold or waiting for the owner; nothing due without a deadline', () => {
    expect(requestClock({ ...base, status: 'on_hold' }, NOW).paused).toBe(true);
    expect(requestClock({ ...base, status: 'quote_sent' }, NOW).paused).toBe(true);
    const none = requestClock({ ...base, nextDueAt: null, nextDueKind: null }, NOW);
    expect([none.nextDueAt, none.minutesLeft]).toEqual([null, null]);
  });
});

describe('audit log person lookup (ADR 0003, C-AUD-1)', () => {
  it('finds a person by exact email or mobile only, never by name', () => {
    expect(auditPersonLookup(' Demo@JADplus.ae ')).toEqual({ kind: 'email', value: 'demo@jadplus.ae' });
    expect(auditPersonLookup('+971 50 000 0000')?.kind).toBe('phone');
    expect(auditPersonLookup('Layla Haddad')).toBeNull();
    expect(adminAuditQuery.safeParse({ person: 'Layla Haddad' }).success).toBe(false);
    expect(adminAuditQuery.safeParse({ person: 'demo@jadplus.ae' }).success).toBe(true);
  });
});
