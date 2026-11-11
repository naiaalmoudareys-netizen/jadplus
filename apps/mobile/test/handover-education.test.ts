/** "Your handover" (O2) and Investor Education (O5, S4) in the owner app (ADR 0033): what is shown and offered. */
import type { HandoverChecklist, OwnerSession } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  bookLine,
  joinLink,
  nextDateLine,
  placeLine,
  seatAction,
  seatLine,
  sessionWhen,
} from '../src/education/logic.js';
import {
  appointmentLine,
  canAskToChange,
  handoverForUnit,
  progressLine,
  stepLines,
} from '../src/handover/logic.js';
import { langOf } from '../src/i18n/lang.js';

const en = langOf('en');
const ar = langOf('ar');
// 9 Nov 2026, 12:00 in Dubai.
const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const HOUR = 3_600_000;

const checklist: HandoverChecklist = {
  id: 'h-1',
  requestId: 'req-h',
  requestRef: 'JAD-H0001',
  unitName: '506-JAD288-C',
  project: 'JAD 288',
  building: 'Block C',
  startedAt: NOW,
  completedAt: null,
  appointment: { date: '2026-11-12', slot: 'morning' },
  steps: [
    { step: 'documents', doneAt: null, note: null },
    { step: 'final_payment', doneAt: NOW, note: 'All paid.' },
    { step: 'key_appointment', doneAt: NOW, note: null },
  ],
};

describe('your handover (O2)', () => {
  it('O2: the checklist belongs to the unit shown, matched by its unit name', () => {
    expect(handoverForUnit([checklist], '506-JAD288-C')).toBe(checklist);
    expect(handoverForUnit([checklist], '1204-J188')).toBeNull();
    expect(handoverForUnit([checklist], null)).toBeNull();
  });

  it('O2: all seven steps show in order, done with the date and the note, or to do', () => {
    const lines = stepLines(checklist, en);
    expect(lines.map((l) => l.step)).toEqual([
      'final_payment',
      'documents',
      'snagging',
      'utilities',
      'service_charges',
      'key_appointment',
      'keys_collected',
    ]);
    expect(lines[0]).toEqual({
      step: 'final_payment',
      title: 'Final payment cleared',
      state: 'Done on 9 November 2026',
      done: true,
      note: 'All paid.',
    });
    expect(lines[1]?.state).toBe('To do');
    expect(progressLine(checklist, en)).toBe('2 of 7 steps done');
    expect(progressLine({ ...checklist, completedAt: NOW }, en)).toBe('Keys collected. Welcome home!');
  });

  it('O2: the key collection appointment is shown, and the owner may ask to change it until the keys are collected', () => {
    expect(appointmentLine(checklist.appointment, en)).toBe('Thu 12 Nov · Morning (9:00 - 12:00)');
    expect(appointmentLine(null, en)).toBeNull();
    expect(appointmentLine(checklist.appointment, ar)).toContain('9:00 - 12:00');
    expect(canAskToChange(checklist)).toBe(true);
    expect(canAskToChange({ ...checklist, appointment: null })).toBe(false);
    expect(canAskToChange({ ...checklist, completedAt: NOW })).toBe(false);
  });
});

const session = (overrides: Partial<OwnerSession> = {}): OwnerSession => ({
  id: 's-1',
  title: 'Investing in Dubai',
  description: 'Payment plans and resale.',
  startsAt: NOW + 24 * HOUR,
  endsAt: NOW + 26 * HOUR,
  mode: 'in_person',
  seats: 20,
  place: 'JAD Global office',
  seatsLeft: 5,
  cancelled: false,
  mySeat: false,
  canCancel: false,
  ...overrides,
});

describe('investor education (O5, S4)', () => {
  it('S4: the next date is always shown, or "Next date to be announced"', () => {
    expect(nextDateLine({ nextStartsAt: null, sessions: [] }, en)).toBe('Next date to be announced');
    const s = session();
    expect(nextDateLine({ nextStartsAt: s.startsAt, sessions: [s] }, en)).toBe(
      'Investing in Dubai · Tue 10 Nov, 12:00 - 14:00',
    );
    expect(sessionWhen(s, en)).toBe('Tue 10 Nov, 12:00 - 14:00');
  });

  it('O5: reserve while seats are left; "Full" otherwise; give back until the start; nothing on a cancelled one', () => {
    expect(seatAction(session(), NOW)).toBe('reserve');
    expect(seatLine(session(), en)).toBe('5 seats left');
    expect(seatLine(session({ seatsLeft: 1 }), en)).toBe('1 seat left');
    expect(seatAction(session({ seatsLeft: 0 }), NOW)).toBeNull();
    expect(seatLine(session({ seatsLeft: 0 }), en)).toBe('Full');
    const mine = session({ mySeat: true, canCancel: true });
    expect(seatAction(mine, NOW)).toBe('give_back');
    expect(seatLine(mine, en)).toBe('You have a seat');
    expect(seatAction(mine, mine.startsAt)).toBeNull();
    expect(seatAction(session({ cancelled: true, mySeat: true }), NOW)).toBeNull();
    expect(seatLine(session({ cancelled: true, mySeat: true }), en)).toBe('This session was cancelled.');
  });

  it('O5: an online link opens only for a seat holder and only if it is https', () => {
    const online = session({ mode: 'online', place: null });
    expect(joinLink(online)).toBeNull();
    expect(placeLine(online, en)).toBe('Online · The joining link is shown once you have a seat.');
    expect(joinLink({ ...online, mySeat: true, place: 'https://meet.example.com/jad' })).toBe(
      'https://meet.example.com/jad',
    );
    expect(joinLink({ ...online, mySeat: true, place: 'javascript:alert(1)' })).toBeNull();
    expect(placeLine(session(), en)).toBe('In person · JAD Global office');
  });

  it('O5: the book is asked for once; then requested or sent with the date', () => {
    expect(bookLine(null, en)).toBeNull();
    expect(bookLine({ status: 'requested', requestedAt: NOW, sentAt: null }, en)).toBe(
      'Requested on 9 November 2026. JAD+ will send it to you.',
    );
    expect(bookLine({ status: 'sent', requestedAt: NOW, sentAt: NOW }, en)).toBe('Sent on 9 November 2026.');
  });
});
