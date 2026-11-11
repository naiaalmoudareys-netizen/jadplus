// Job page clock, finished-work photos and per-technician numbers (S4, E4, E10, S5, S6, C-UPL-1).
import { describe, expect, it } from 'vitest';
import { acknowledgedFact, deadlineFact, dueKindText } from '../src/lib/jobs';
import { completionPhotoSlots, photoProblem } from '../src/lib/photos';
import { meetsTone, teamStatsQuery } from '../src/lib/stats';

const MIN = 60_000;
const NOW = Date.parse('2026-11-12T10:00:00+04:00');
const clock = {
  acknowledgedAt: null,
  nextDueAt: NOW + 10 * MIN,
  nextDueKind: 'emergency_ack',
  paused: false,
};

describe('job page clock (S4, E4)', () => {
  it('E4: shows what is due, the time left and the Dubai time', () => {
    expect(deadlineFact(clock, NOW)).toEqual({
      text: 'Acknowledge the emergency: due in 10 min (12 Nov 2026, 10:10)',
      tone: 'warn',
    });
    expect(deadlineFact({ ...clock, nextDueAt: NOW + 5 * 3_600_000 }, NOW).tone).toBe('good');
  });

  it('S4: a missed deadline is overdue and red', () => {
    expect(deadlineFact(clock, NOW + 15 * MIN)).toEqual({
      text: 'Acknowledge the emergency: overdue by 5 min (12 Nov 2026, 10:10)',
      tone: 'bad',
    });
  });

  it('A6: a paused clock and no deadline say so', () => {
    expect(deadlineFact({ ...clock, paused: true }, NOW).text).toMatch(/paused/);
    expect(deadlineFact({ ...clock, nextDueAt: null, nextDueKind: null }, NOW).text).toBe('Nothing due');
    expect(dueKindText('some_new_kind')).toBe('Some new kind');
  });

  it('E4: acknowledged or not; a routine request is answered by booking the visit', () => {
    expect(acknowledgedFact(clock, true)).toEqual({ text: 'Not acknowledged yet', tone: 'warn' });
    expect(acknowledgedFact({ ...clock, acknowledgedAt: NOW }, true).text).toBe(
      'Acknowledged 12 Nov 2026, 10:00',
    );
    expect(acknowledgedFact(clock, false).text).toBe('No visit booked yet');
  });
});

describe('finished-work photos from the console (E10, C-UPL-1)', () => {
  it('E10: only while working or waiting for confirmation, for an office that may act, up to 3', () => {
    expect(completionPhotoSlots('in_progress', true, 0)).toBe(3);
    expect(completionPhotoSlots('completed', true, 2)).toBe(1);
    expect(completionPhotoSlots('completed', true, 3)).toBe(0);
    expect(completionPhotoSlots('scheduled', true, 0)).toBe(0);
    expect(completionPhotoSlots('in_progress', false, 0)).toBe(0);
  });

  it('C-UPL-1: JPEG or PNG, up to 10 MB each, no more than the slots left', () => {
    const jpeg = { type: 'image/jpeg', size: 1000 };
    expect(photoProblem([jpeg], 1)).toBeNull();
    expect(photoProblem([], 3)).toMatch(/Choose/);
    expect(photoProblem([jpeg, jpeg], 1)).toMatch(/Only 1 more/);
    expect(photoProblem([{ type: 'image/heic', size: 1000 }], 3)).toMatch(/JPEG or PNG/);
    expect(photoProblem([{ type: 'image/png', size: 10 * 1024 * 1024 + 1 }], 3)).toMatch(/10 MB/);
  });
});

describe('per-technician numbers (S5, S6)', () => {
  it('S6: on target green, below red, no data grey', () => {
    expect([meetsTone(true), meetsTone(false), meetsTone(null)]).toEqual(['good', 'bad', 'calm']);
  });

  it('S5: the month on the page, or the last 30 days (no month)', () => {
    expect(teamStatsQuery('month', '2026-10')).toEqual({ month: '2026-10' });
    expect(teamStatsQuery('recent', '2026-10')).toEqual({ month: null });
  });
});
