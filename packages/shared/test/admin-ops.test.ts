/** JAD+ Admin operations rules (ADR 0025): month ranges, CSV, percentages, clocks after staff actions. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR,
  EMERGENCY_ACK_MINUTES,
  adminAuditQuery,
  adminDeskUpdateBody,
  adminRaiseBody,
  average,
  csvCell,
  dayRange,
  deskChangeAllowed,
  monthOf,
  monthRange,
  monthSchema,
  monthlyReportCsv,
  peopleSearch,
  percent,
  previousMonth,
  reassignedDue,
  reclassifiedDue,
  staffRemovalProblem,
  toCsv,
} from '../src/index.js';

const HOUR = 3_600_000;
// Monday 9 November 2026, 12:00 Dubai (08:00 UTC): working hours.
const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);

describe('months and days (Dubai, UTC+4)', () => {
  it('a month runs from 00:00 Dubai on the 1st (20:00 UTC the day before)', () => {
    expect(monthRange('2026-11')).toEqual({
      start: Date.UTC(2026, 9, 31, 20),
      end: Date.UTC(2026, 10, 30, 20),
    });
    expect(monthRange('2026-12').end).toBe(Date.UTC(2026, 11, 31, 20));
  });

  it('the month of an instant is Dubai’s, and the month before wraps the year', () => {
    expect(monthOf(Date.UTC(2026, 9, 31, 21))).toBe('2026-11');
    expect(monthOf(Date.UTC(2026, 9, 31, 19))).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });

  it('today is the Dubai day', () => {
    expect(dayRange(NOW)).toEqual({ start: Date.UTC(2026, 10, 8, 20), end: Date.UTC(2026, 10, 9, 20) });
  });

  it('only real months are accepted', () => {
    expect(monthSchema.safeParse('2026-11').success).toBe(true);
    expect(monthSchema.safeParse('2026-13').success).toBe(false);
    expect(monthSchema.safeParse('2026-1').success).toBe(false);
  });
});

describe('numbers', () => {
  it('S5: percentages and averages have one decimal and are null without data (never a fake 0 %)', () => {
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(0, 0)).toBeNull();
    expect(average(9, 2)).toBe(4.5);
    expect(average(0, 0)).toBeNull();
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks; stops spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('JAD 288')).toBe('JAD 288');
    expect(csvCell('Fixers, LLC')).toBe('"Fixers, LLC"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell(null)).toBe('');
    expect(csvCell(-1)).toBe('-1');
    expect(
      toCsv([
        ['a', 1],
        ['b', null],
      ]),
    ).toBe('a,1\r\nb,\r\n');
  });

  it('the monthly report CSV has a header and one row per service, project and partner', () => {
    const csv = monthlyReportCsv({
      month: '2026-11',
      totals: {
        raised: 3,
        emergencies: 1,
        closed: 1,
        slaMetPct: 50,
        averageRating: 4.5,
        ratings: 2,
        repeatVisits: 0,
      },
      byService: [{ code: 'maintenance', name: 'Maintenance', raised: 3, closed: 1 }],
      byProject: [{ project: 'JAD 288', raised: 3 }],
      byPartner: [
        {
          partnerId: 'p-1',
          name: 'Fictional Fixers LLC',
          jobs: 3,
          closed: 1,
          slaMetPct: 50,
          averageRating: 4.5,
          repeatVisits: 0,
        },
      ],
    });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('section,name,requests,closed,sla_met_pct,average_rating,repeat_visits');
    expect(lines).toContain('partner,Fictional Fixers LLC,3,1,50,4.5,0');
    expect(lines).toHaveLength(6);
  });
});

describe('staff actions', () => {
  it('E6/S6: a moved emergency must be acknowledged in 15 minutes; a routine job answered in 4 working hours', () => {
    expect(reassignedDue(true, NOW, DEFAULT_CALENDAR)).toEqual({
      at: NOW + EMERGENCY_ACK_MINUTES * 60_000,
      kind: 'emergency_ack',
    });
    expect(reassignedDue(false, NOW, DEFAULT_CALENDAR)).toEqual({
      at: NOW + 4 * HOUR,
      kind: 'routine_response',
    });
  });

  it('E13: reclassified to routine, an unanswered job gets the routine clock; emergency deadlines are dropped', () => {
    expect(reclassifiedDue('assigned', { at: NOW, kind: 'emergency_ack' }, NOW, DEFAULT_CALENDAR)?.kind).toBe(
      'routine_response',
    );
    expect(
      reclassifiedDue('scheduled', { at: NOW, kind: 'emergency_on_site' }, NOW, DEFAULT_CALENDAR),
    ).toBeNull();
    const visit = { at: NOW + HOUR, kind: 'visit' };
    expect(reclassifiedDue('scheduled', visit, NOW, DEFAULT_CALENDAR)).toBe(visit);
  });

  it('ADR 0011: the desk moves a request on; Completed and Cancelled are final', () => {
    expect(deskChangeAllowed('New', 'In progress')).toBe(true);
    expect(deskChangeAllowed('In progress', 'Completed')).toBe(true);
    expect(deskChangeAllowed('Completed', 'In progress')).toBe(false);
    expect(deskChangeAllowed('Cancelled', 'Completed')).toBe(false);
    expect(adminDeskUpdateBody.safeParse({ status: 'New' }).success).toBe(false);
  });

  it('C-AZ-1: nobody removes their own staff access, and the last administrator stays', () => {
    const base = { actorUserId: 'a', targetUserId: 'b', targetIsAdmin: true, liveAdmins: 2 };
    expect(staffRemovalProblem(base)).toBeNull();
    expect(staffRemovalProblem({ ...base, targetUserId: 'a' })).toBe('self');
    expect(staffRemovalProblem({ ...base, liveAdmins: 1 })).toBe('last_admin');
    expect(staffRemovalProblem({ ...base, targetIsAdmin: false, liveAdmins: 1 })).toBeNull();
  });
});

describe('search and validation', () => {
  it('C-PD-2: a search is an exact email, an exact mobile number, or else a unit name', () => {
    expect(peopleSearch(' Demo@JADplus.ae ')).toEqual({ kind: 'email', value: 'demo@jadplus.ae' });
    expect(peopleSearch('+971 50 000 0000').kind).toBe('phone');
    expect(peopleSearch('JAD288-1100')).toEqual({ kind: 'unit', value: 'JAD288-1100' });
  });

  it('U8/V3: raising for an owner needs the owner, the unit and a known service; unknown keys are refused', () => {
    const body = {
      ownerUserId: 'u-1',
      sfUnitId: 'a0X000000000001AAA',
      serviceCode: 'maintenance',
      description: 'Called the desk: tap leaking.',
      preferredDate: '2026-11-10',
      preferredSlot: 'morning',
    };
    expect(adminRaiseBody.safeParse(body).success).toBe(true);
    expect(adminRaiseBody.safeParse({ ...body, raisedBy: 'x' }).success).toBe(false);
    expect(adminRaiseBody.safeParse({ ...body, serviceCode: 'cleaning' }).success).toBe(false);
  });

  it('C-AUD-1: the audit query takes times as numbers and refuses odd action names', () => {
    expect(adminAuditQuery.parse({ from: '100', before: '5' })).toEqual({ from: 100, before: 5 });
    expect(adminAuditQuery.safeParse({ action: 'DROP TABLE' }).success).toBe(false);
    expect(adminAuditQuery.safeParse({ page: '2' }).success).toBe(false);
  });
});
