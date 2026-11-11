import { describe, expect, it } from 'vitest';
import {
  canCancelSeat,
  canMarkAttendance,
  educationSessionBody,
  isSessionLink,
  nextSession,
  seatRefusal,
  seatsLeft,
  shownPlace,
} from '../src/index.js';

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const HOUR = 3_600_000;
const at = (hours: number, cancelledAt: number | null = null) => ({
  startsAt: NOW + hours * HOUR,
  endsAt: NOW + (hours + 2) * HOUR,
  cancelledAt,
});

describe('investor education (O5, S4)', () => {
  it('S4/O5: the next date is the earliest session not started and not cancelled; none means "to be announced"', () => {
    const sessions = [at(48), at(5, NOW), at(-1), at(24)];
    expect(nextSession(sessions, NOW)).toBe(sessions[3]);
    expect(nextSession([at(-1), at(3, NOW)], NOW)).toBeNull();
    expect(nextSession([], NOW)).toBeNull();
  });

  it('O5: one seat per owner per session; "Full" when none is left; never after the start or when cancelled', () => {
    const s = { ...at(24), seats: 2 };
    expect(seatRefusal(s, 0, false, NOW)).toBeNull();
    expect(seatRefusal(s, 1, true, NOW)).toBe('already');
    expect(seatRefusal(s, 2, false, NOW)).toBe('full');
    expect(seatRefusal(s, 0, false, s.startsAt)).toBe('started');
    expect(seatRefusal({ ...s, cancelledAt: NOW }, 0, false, NOW)).toBe('cancelled');
    expect(seatsLeft(2, 1)).toBe(1);
    expect(seatsLeft(2, 5)).toBe(0);
  });

  it('O5: a seat can be given back until the start; attendance is marked from the start', () => {
    const s = at(1);
    expect(canCancelSeat(s, NOW)).toBe(true);
    expect(canCancelSeat(s, s.startsAt)).toBe(false);
    expect(canCancelSeat(at(1, NOW), NOW)).toBe(false);
    expect(canMarkAttendance(s, NOW)).toBe(false);
    expect(canMarkAttendance(s, s.startsAt)).toBe(true);
    expect(canMarkAttendance(at(-1, NOW), NOW)).toBe(false);
  });

  it('O5: an online link is shown only to seat holders; an address to everyone', () => {
    expect(shownPlace('in_person', 'Business Bay office', false)).toBe('Business Bay office');
    expect(shownPlace('online', 'https://meet.example.com/a', false)).toBeNull();
    expect(shownPlace('online', 'https://meet.example.com/a', true)).toBe('https://meet.example.com/a');
    expect(isSessionLink('https://meet.example.com/a')).toBe(true);
    expect(isSessionLink('http://meet.example.com/a')).toBe(false);
    expect(isSessionLink('https://meet.example.com/a b')).toBe(false);
  });

  it('O5/C-VAL-1: a session payload is strict, ends after it starts, lasts at most 12 hours', () => {
    const ok = {
      title: 'Investing in Dubai',
      description: 'Payment plans and resale.',
      startsAt: NOW + 24 * HOUR,
      endsAt: NOW + 26 * HOUR,
      mode: 'in_person',
      place: 'JAD Global office',
      seats: 30,
    };
    expect(educationSessionBody.safeParse(ok).success).toBe(true);
    expect(educationSessionBody.safeParse({ ...ok, endsAt: ok.startsAt }).success).toBe(false);
    expect(educationSessionBody.safeParse({ ...ok, endsAt: ok.startsAt + 13 * HOUR }).success).toBe(false);
    expect(educationSessionBody.safeParse({ ...ok, mode: 'online' }).success).toBe(false);
    expect(
      educationSessionBody.safeParse({ ...ok, mode: 'online', place: 'https://meet.example.com/a' }).success,
    ).toBe(true);
    expect(educationSessionBody.safeParse({ ...ok, seats: 501 }).success).toBe(false);
    expect(educationSessionBody.safeParse({ ...ok, extra: true }).success).toBe(false);
  });
});
