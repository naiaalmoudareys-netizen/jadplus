import type { HandoverChecklist, StaffSession } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SESSION_FORM,
  appointmentText,
  bookingsCsv,
  formOf,
  handoverProgressText,
  seatsText,
  sessionBodyOf,
  staffBase,
  unitText,
} from '../src/lib/owner-journey';
import { formatRoute, isCurrent, navFor, parseHash, routeAllowed } from '../src/lib/router';

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);

const checklist: HandoverChecklist = {
  id: 'h-1',
  requestId: 'req-h',
  requestRef: 'JAD-H0001',
  unitName: '506-JAD288-C',
  project: 'JAD 288',
  building: 'Block C',
  startedAt: NOW,
  completedAt: null,
  appointment: null,
  steps: [
    { step: 'final_payment', doneAt: NOW, note: null },
    { step: 'documents', doneAt: null, note: null },
  ],
};

const session: StaffSession = {
  id: 's-1',
  title: 'Investing in Dubai',
  description: 'Payment plans and resale.',
  startsAt: Date.parse('2026-11-12T18:00:00+04:00'),
  endsAt: Date.parse('2026-11-12T20:00:00+04:00'),
  mode: 'in_person',
  seats: 2,
  place: 'JAD Global office',
  booked: 1,
  attended: 0,
  cancelledAt: null,
  createdAt: NOW,
};

describe('handover pages (O2)', () => {
  it('O2: both consoles open Handovers and a checklist; the address round-trips', () => {
    for (const route of [{ name: 'handovers' as const }, { name: 'handover' as const, id: 'h-1' }]) {
      expect(parseHash(formatRoute(route))).toEqual(route);
      expect(routeAllowed(route, 'jad_admin')).toBe(true);
      expect(routeAllowed(route, 'jad_viewer')).toBe(true);
      expect(routeAllowed(route, 'partner_admin')).toBe(true);
      expect(routeAllowed(route, 'owner')).toBe(false);
    }
    // ADR 0034: the office menu shows Handovers to the handover team.
    const team = { kind: 'jad_group' as const, services: ['handover'], managesUnits: false };
    expect(navFor('partner_admin', team).some((n) => n.route.name === 'handovers')).toBe(true);
    expect(isCurrent({ name: 'handovers' }, { name: 'handover', id: 'h-1' })).toBe(true);
    expect(parseHash('#/handovers/../x').name).toBe('not_found');
  });

  it('O2: progress, appointment and unit read plainly; offices call /api/partner, staff /api/admin', () => {
    expect(handoverProgressText(checklist)).toBe('1 of 7 steps done');
    expect(handoverProgressText({ ...checklist, completedAt: NOW })).toBe('Keys collected 9 Nov 2026, 12:00');
    expect(appointmentText(checklist)).toBe('Not booked yet');
    expect(appointmentText({ appointment: { date: '2026-11-12', slot: 'morning' } })).toBe(
      '12 Nov 2026 · Morning (9:00 - 12:00)',
    );
    expect(unitText(checklist)).toBe('506-JAD288-C · JAD 288, Block C');
    expect(unitText({ unitName: null, project: null, building: null })).toBe('Unit name not on file');
    expect(staffBase('partner_admin')).toBe('partner');
    expect(staffBase('jad_viewer')).toBe('admin');
  });
});

describe('education pages (O5)', () => {
  it('O5: both consoles open Education and a session; the address round-trips', () => {
    const route = { name: 'education_session' as const, id: 's-1' };
    expect(parseHash(formatRoute(route))).toEqual(route);
    expect(parseHash('#/education')).toEqual({ name: 'education' });
    expect(routeAllowed(route, 'partner_admin')).toBe(true);
    expect(routeAllowed(route, 'tenant')).toBe(false);
  });

  it('O5: the form gives a Dubai-time body, or the first problem in plain words', () => {
    const filled = {
      ...EMPTY_SESSION_FORM,
      title: 'Investing',
      description: 'About it.',
      date: '2026-11-12',
      place: 'Office',
    };
    const result = sessionBodyOf(filled);
    expect(result).toEqual({
      body: {
        title: 'Investing',
        description: 'About it.',
        startsAt: Date.parse('2026-11-12T18:00:00+04:00'),
        endsAt: Date.parse('2026-11-12T20:00:00+04:00'),
        mode: 'in_person',
        place: 'Office',
        seats: 30,
      },
    });
    expect(sessionBodyOf({ ...filled, date: '' })).toEqual({
      problem: 'Give the date, and the start and end times.',
    });
    expect(sessionBodyOf({ ...filled, mode: 'online' })).toEqual({
      problem: 'For an online session, give the https:// joining link.',
    });
    expect(formOf(session)).toMatchObject({ date: '2026-11-12', from: '18:00', to: '20:00', seats: '2' });
    expect(seatsText(session)).toBe('1 of 2 seats booked');
    expect(seatsText({ seats: 2, booked: 2 })).toBe('Full (2 seats)');
  });

  it('O5: the bookings CSV lists seats held, spreadsheet-safe', () => {
    const csv = bookingsCsv(session, [
      {
        id: 'b-1',
        owner: { userId: 'u-1', name: '=Layla Haddad' },
        bookedAt: NOW,
        cancelledAt: null,
        attendedAt: NOW,
      },
      {
        id: 'b-2',
        owner: { userId: 'u-2', name: 'Omar Test' },
        bookedAt: NOW,
        cancelledAt: NOW,
        attendedAt: null,
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Session,Date,Owner,Booked,Attended',
      `Investing in Dubai,"12 Nov 2026, 18:00-20:00",'=Layla Haddad,"9 Nov 2026, 12:00",Yes`,
      '',
    ]);
  });
});
