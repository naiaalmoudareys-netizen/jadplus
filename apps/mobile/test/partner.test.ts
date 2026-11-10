/** The technician's tabs and job page (R3, S5, S8): today's visits, queue groups, next step, maps, numbers. */
import type { PartnerJob } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  groupJobs,
  mapsLink,
  nextStep,
  onTimePercent,
  oneTapAction,
  ratingText,
  todayJobs,
} from '../src/partner/logic.js';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026

function job(id: string, over: Partial<PartnerJob> = {}): PartnerJob {
  return {
    id,
    ref: `JAD-${id}`,
    emergency: false,
    emergencyType: null,
    serviceName: 'Maintenance',
    status: 'scheduled',
    description: 'Fix the tap',
    nextDueAt: null,
    nextDueKind: null,
    technicianId: null,
    arrivalWindow: null,
    preferredVisit: null,
    location: null,
    createdAt: NOW - 24 * HOUR,
    ...over,
  };
}

const at = (start: number) => ({ arrivalWindow: { start, end: start + 2 * HOUR } });

describe('R3: Today', () => {
  it('lists new emergencies first, then visits starting today (Dubai date) by time', () => {
    const jobs = [
      job('late', at(NOW + 6 * HOUR)),
      job('tomorrow', at(NOW + 15 * HOUR)), // 01:00 Dubai on Wed
      job('early', at(NOW - HOUR)),
      job('new', { emergency: true, status: 'assigned' }),
      job('none'),
    ];
    const today = todayJobs(jobs, NOW);
    expect(today.urgent.map((j) => j.id)).toEqual(['new']);
    expect(today.visits.map((j) => j.id)).toEqual(['early', 'late']);
  });

  it('uses the Dubai date, not the UTC date (21:00 UTC is already tomorrow in Dubai)', () => {
    const lateEvening = Date.UTC(2026, 10, 10, 21, 0); // 01:00 Wed in Dubai
    expect(todayJobs([job('a', at(NOW))], lateEvening).visits).toEqual([]);
    expect(todayJobs([job('b', at(lateEvening + HOUR))], lateEvening).visits).toHaveLength(1);
  });

  it('is empty on a calm day', () => {
    expect(todayJobs([], NOW)).toEqual({ urgent: [], visits: [] });
  });
});

describe('R3: Jobs groups', () => {
  it('needs you now (new emergencies, overdue), upcoming, waiting on the owner; empty groups left out', () => {
    const jobs = [
      job('ack', { emergency: true, status: 'assigned', nextDueAt: NOW + 10 * 60_000 }),
      job('booked', { nextDueAt: NOW + 5 * HOUR }),
      job('overdue', { status: 'assigned', nextDueAt: NOW - 60_000 }),
      job('quote', { status: 'quote_sent' }),
      job('routine', { status: 'assigned' }),
    ];
    expect(groupJobs(jobs, NOW).map((g) => [g.group, g.jobs.map((j) => j.id)])).toEqual([
      ['now', ['ack', 'overdue']],
      ['upcoming', ['booked', 'routine']],
      ['owner', ['quote']],
    ]);
    expect(groupJobs([job('q', { status: 'quote_sent' })], NOW).map((g) => g.group)).toEqual(['owner']);
    expect(groupJobs([], NOW)).toEqual([]);
  });
});

describe('R3: next step on a job', () => {
  const emergency = { emergency: true, status: 'assigned' } as const;
  const routine = { emergency: false, status: 'scheduled' } as const;

  it('E4: a new emergency is acknowledged first', () => {
    expect(nextStep(emergency, [], false)).toBe('acknowledge');
  });

  it('finishing work in progress comes before anything else', () => {
    expect(nextStep({ ...routine, status: 'in_progress' }, ['send_quote', 'work_done'], true)).toBe(
      'work_done',
    );
  });

  it('books the first visit; once booked, "I\'m on my way", then "Start work"', () => {
    expect(nextStep({ ...routine, status: 'assigned' }, ['book_visit', 'send_quote'], false)).toBe(
      'book_visit',
    );
    expect(
      nextStep(routine, ['book_visit', 'send_quote', 'start_work', 'on_my_way', 'no_access'], true),
    ).toBe('on_my_way');
    expect(nextStep(routine, ['book_visit', 'send_quote', 'start_work', 'no_access'], true)).toBe(
      'start_work',
    );
  });

  it('nothing while a quote waits for the owner (L4)', () => {
    expect(nextStep({ ...routine, status: 'quote_sent' }, [], true)).toBeNull();
  });

  it('A8: "I\'m on my way" and "Start work" are done on the Next step button, not shown twice', () => {
    expect(oneTapAction('on_my_way')).toBe('on_my_way');
    expect(oneTapAction('start_work')).toBe('start_work');
    expect(oneTapAction('book_visit')).toBeNull();
    expect(oneTapAction('acknowledge')).toBeNull();
    expect(oneTapAction(null)).toBeNull();
  });
});

describe('maps link', () => {
  const location = {
    unitName: 'JAD288-1102',
    project: 'JAD 288',
    building: 'Building B',
    address: 'Al Barsha South, Dubai',
  };

  it('searches the building, project and address (never the unit number)', () => {
    const google = mapsLink(location, 'android');
    expect(google).toBe(
      'https://www.google.com/maps/search/?api=1&query=Building%20B%2C%20JAD%20288%2C%20Al%20Barsha%20South%2C%20Dubai',
    );
    expect(google).not.toContain('1102');
    expect(mapsLink(location, 'ios')).toBe(
      'https://maps.apple.com/?q=Building%20B%2C%20JAD%20288%2C%20Al%20Barsha%20South%2C%20Dubai',
    );
  });

  it('skips missing parts, and gives no link when nothing is known', () => {
    expect(mapsLink({ ...location, building: null, address: ' ' }, 'ios')).toBe(
      'https://maps.apple.com/?q=JAD%20288',
    );
    expect(mapsLink({ unitName: 'X-1', project: null, building: null, address: null }, 'ios')).toBeNull();
    expect(mapsLink(null, 'android')).toBeNull();
  });
});

describe('S5, S8: my numbers', () => {
  it('on time as a whole percent, none when nothing was measured', () => {
    expect(onTimePercent({ met: 9, total: 10 })).toBe(90);
    expect(onTimePercent({ met: 2, total: 3 })).toBe(67);
    expect(onTimePercent({ met: 0, total: 0 })).toBeNull();
  });

  it('average rating with one decimal, none before the first rating', () => {
    expect(ratingText({ average: 4.56, count: 9 })).toBe('4.6');
    expect(ratingText({ average: 5, count: 1 })).toBe('5.0');
    expect(ratingText({ average: null, count: 0 })).toBeNull();
  });
});
