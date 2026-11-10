import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR } from '../src/calendar.js';
import {
  choosePartner,
  makeSafeWithinCap,
  nextEscalation,
  stageAfter,
  type DispatchPartner,
  type EmergencyClock,
} from '../src/escalation.js';
import { documentStanding, partnerCompliance, reviewFlags } from '../src/scorecard.js';
import { MAINTENANCE_SLA, dueAt, elapsedMinutes, slaMet } from '../src/sla.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 10 Nov 2026, 10:00 Dubai (06:00 UTC). */
const MON_10 = Date.UTC(2026, 10, 9, 6, 0, 0) + DAY;
/** Tuesday 1 Dec 2026 is Commemoration Day; 2-3 Dec National Day. */
const MON_30_NOV_17 = Date.UTC(2026, 10, 30, 13, 0, 0);

describe('SLA clocks (S4, A6, E20)', () => {
  it('S4: emergency acknowledgement is due 15 minutes after raising, any hour of any day', () => {
    const sundayNight = Date.UTC(2026, 10, 15, 19, 0, 0);
    expect(dueAt(MAINTENANCE_SLA.emergencyAck, sundayNight, [], DEFAULT_CALENDAR)).toBe(
      sundayNight + 15 * MIN,
    );
  });

  it('S4: emergency on site within 2 hours, 24/7', () => {
    expect(dueAt(MAINTENANCE_SLA.emergencyOnSite, MON_10, [], DEFAULT_CALENDAR)).toBe(MON_10 + 2 * HOUR);
  });

  it('S4: a routine request must be answered within 4 working hours', () => {
    expect(dueAt(MAINTENANCE_SLA.routineResponse, MON_10, [], DEFAULT_CALENDAR)).toBe(MON_10 + 4 * HOUR);
  });

  it('E20: emergency clocks run through public holidays; routine clocks pause for them', () => {
    // Raised Monday 30 Nov 17:00 Dubai; 1-3 Dec are holidays, so 3 of the 4 working hours fall on Fri 4 Dec.
    const routine = dueAt(MAINTENANCE_SLA.routineResponse, MON_30_NOV_17, [], DEFAULT_CALENDAR);
    expect(routine).toBe(Date.UTC(2026, 11, 4, 8, 0, 0));
    const emergency = dueAt(MAINTENANCE_SLA.emergencyOnSite, MON_30_NOV_17, [], DEFAULT_CALENDAR);
    expect(emergency).toBe(MON_30_NOV_17 + 2 * HOUR);
  });

  it('S4: routine visit within 2 working days; quote within 24 hours after the visit', () => {
    expect(dueAt(MAINTENANCE_SLA.routineVisit, MON_10, [], DEFAULT_CALENDAR)).toBe(MON_10 + 2 * DAY);
    expect(dueAt(MAINTENANCE_SLA.quoteAfterVisit, MON_10, [], DEFAULT_CALENDAR)).toBe(MON_10 + DAY);
  });

  it('A6: time on hold does not count; while on hold there is no deadline', () => {
    const pause = { from: MON_10 + HOUR, to: MON_10 + 2 * HOUR };
    expect(elapsedMinutes('working', MON_10, MON_10 + 3 * HOUR, [pause], DEFAULT_CALENDAR)).toBe(120);
    expect(dueAt(MAINTENANCE_SLA.routineResponse, MON_10, [pause], DEFAULT_CALENDAR)).toBe(MON_10 + 5 * HOUR);
    expect(
      dueAt(MAINTENANCE_SLA.routineResponse, MON_10, [{ from: MON_10, to: null }], DEFAULT_CALENDAR),
    ).toBeNull();
  });

  it('S5: met means done at or before the due time', () => {
    expect(slaMet(MON_10, MON_10)).toBe(true);
    expect(slaMet(MON_10, MON_10 + 1)).toBe(false);
  });
});

describe('emergency escalation (E4-E7)', () => {
  const base: EmergencyClock = {
    raisedAt: MON_10,
    stage: 'none',
    movedToBackupAt: null,
    acknowledged: false,
    backupAvailable: true,
  };

  it('E5: no acknowledgement at 15 minutes → reminder to the primary partner', () => {
    expect(nextEscalation(base, MON_10 + 14 * MIN)).toBeNull();
    expect(nextEscalation(base, MON_10 + 15 * MIN)).toBe('remind_primary');
    expect(nextEscalation({ ...base, stage: 'reminded' }, MON_10 + 20 * MIN)).toBeNull();
  });

  it('E6: emergency moves to backup after 30 min', () => {
    expect(nextEscalation({ ...base, stage: 'reminded' }, MON_10 + 30 * MIN)).toBe('move_to_backup');
    // A missed sweep catches up: straight from 'none' to the backup.
    expect(nextEscalation(base, MON_10 + 40 * MIN)).toBe('move_to_backup');
  });

  it('E7: backup also fails to acknowledge within 15 minutes → on-call takes over', () => {
    const moved = { ...base, stage: 'moved_to_backup' as const, movedToBackupAt: MON_10 + 30 * MIN };
    expect(nextEscalation(moved, MON_10 + 44 * MIN)).toBeNull();
    expect(nextEscalation(moved, MON_10 + 45 * MIN)).toBe('call_on_call');
    expect(nextEscalation({ ...moved, stage: 'on_call' }, MON_10 + 3 * HOUR)).toBeNull();
  });

  it('E6/E7: with no active backup, 30 minutes goes straight to on-call', () => {
    expect(nextEscalation({ ...base, backupAvailable: false }, MON_10 + 30 * MIN)).toBe('call_on_call');
  });

  it('E4: an acknowledged emergency never escalates', () => {
    expect(nextEscalation({ ...base, acknowledged: true }, MON_10 + 5 * HOUR)).toBeNull();
  });

  it('each action moves the request to the matching stage', () => {
    expect(stageAfter('remind_primary')).toBe('reminded');
    expect(stageAfter('move_to_backup')).toBe('moved_to_backup');
    expect(stageAfter('call_on_call')).toBe('on_call');
  });
});

describe('dispatch and make-safe (S2, S3, S7, P4, E8)', () => {
  const active = (id: string): DispatchPartner => ({ id, status: 'active' });

  it('S3: new jobs go to the primary partner', () => {
    expect(choosePartner(active('p1'), active('p2'))?.id).toBe('p1');
  });

  it('S7/P4: a suspended or ended primary is skipped and the backup takes the job', () => {
    expect(choosePartner({ id: 'p1', status: 'suspended' }, active('p2'))?.id).toBe('p2');
    expect(choosePartner({ id: 'p1', status: 'ended' }, active('p2'))?.id).toBe('p2');
  });

  it('S2: no partner able to work means the service is "coming soon"', () => {
    expect(choosePartner(null, null)).toBeNull();
    expect(choosePartner({ id: 'p1', status: 'suspended' }, null)).toBeNull();
  });

  it('E8: make-safe work only within the owner pre-authorised cap; no cap means no make-safe', () => {
    expect(makeSafeWithinCap(50_000, 50_000)).toBe(true);
    expect(makeSafeWithinCap(50_001, 50_000)).toBe(false);
    expect(makeSafeWithinCap(10_000, null)).toBe(false);
    expect(makeSafeWithinCap(0, 50_000)).toBe(false);
  });
});

describe('scorecard thresholds (S6) and compliance (S7, P3)', () => {
  const now = MON_10;
  const none = { ratings: [], missedEmergencies: [], breaches: [] };

  it('S6: average rating below 4.0 over the last 30 days flags the partner', () => {
    const ratings = [
      { at: now - 2 * DAY, stars: 4 },
      { at: now - 3 * DAY, stars: 3 },
      { at: now - 40 * DAY, stars: 1 }, // outside the window
    ];
    expect(reviewFlags({ ...none, ratings }, now)).toEqual([
      { kind: 'low_rating', average: 3.5, ratings: 2 },
    ]);
    expect(reviewFlags({ ...none, ratings: [{ at: now - DAY, stars: 4 }] }, now)).toEqual([]);
  });

  it('S6: two missed emergencies in 90 days flag the partner; one does not', () => {
    expect(reviewFlags({ ...none, missedEmergencies: [now - 10 * DAY] }, now)).toEqual([]);
    expect(reviewFlags({ ...none, missedEmergencies: [now - 10 * DAY, now - 80 * DAY] }, now)).toEqual([
      { kind: 'missed_emergencies', count: 2 },
    ]);
    expect(reviewFlags({ ...none, missedEmergencies: [now - 10 * DAY, now - 100 * DAY] }, now)).toEqual([]);
  });

  it('S6: a single safety or honesty breach flags the partner', () => {
    expect(reviewFlags({ ...none, breaches: [{ kind: 'honesty_breach', at: now - DAY }] }, now)).toEqual([
      { kind: 'breach', breach: 'honesty_breach' },
    ]);
  });

  it('S7: licence/insurance flagged 30 days ahead; lapsed the day after expiry', () => {
    expect(documentStanding('2026-12-31', '2026-11-09')).toBe('valid');
    expect(documentStanding('2026-12-09', '2026-11-09')).toBe('expiring_soon');
    expect(documentStanding('2026-11-09', '2026-11-09')).toBe('expiring_soon');
    expect(documentStanding('2026-11-08', '2026-11-09')).toBe('lapsed');
    expect(documentStanding(null, '2026-11-09')).toBe('missing');
  });

  it('S7/P3: a lapsed or missing licence or insurance suspends the partner; expiring soon warns', () => {
    expect(partnerCompliance({ licence: '2027-06-30', insurance: '2027-06-30' }, '2026-11-09').action).toBe(
      'ok',
    );
    expect(partnerCompliance({ licence: '2027-06-30', insurance: '2026-11-20' }, '2026-11-09').action).toBe(
      'warn',
    );
    expect(partnerCompliance({ licence: '2026-11-01', insurance: '2027-06-30' }, '2026-11-09').action).toBe(
      'suspend',
    );
    expect(partnerCompliance({ licence: '2027-06-30', insurance: null }, '2026-11-09').action).toBe(
      'suspend',
    );
  });
});
