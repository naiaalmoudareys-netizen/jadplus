/**
 * Console helpers for the handover checklist (O2) and investor education (O5) (ADR 0033): the API base of the
 * signed-in console, wording, the session form, and the bookings CSV. Pure functions, tested without a browser.
 */
import {
  HANDOVER_STEP_LABELS,
  dubaiClock,
  dubaiDate,
  educationSessionBody,
  handoverProgress,
  toCsv,
  type EducationSessionBody,
  type HandoverChecklist,
  type SessionMode,
  type StaffBookings,
  type StaffSession,
  type UserRole,
} from '@jadplus/shared';
import { dubaiInstant } from './dates';
import { dateTime, dayText, preferredText } from './format';

/** JAD+ Admin and viewers call /api/admin, a partner office /api/partner (the API checks the role again). */
export function staffBase(role: UserRole): 'admin' | 'partner' {
  return role === 'partner_admin' ? 'partner' : 'admin';
}

export function handoverProgressText(h: HandoverChecklist): string {
  if (h.completedAt !== null) return `Keys collected ${dateTime(h.completedAt)}`;
  const { done, total } = handoverProgress(h);
  return `${String(done)} of ${String(total)} steps done`;
}

export function appointmentText(h: Pick<HandoverChecklist, 'appointment'>): string {
  return h.appointment === null ? 'Not booked yet' : preferredText(h.appointment);
}

export function unitText(u: {
  unitName: string | null;
  project: string | null;
  building: string | null;
}): string {
  const place = [u.project, u.building].filter((p): p is string => p !== null).join(', ');
  const name = u.unitName ?? 'Unit name not on file';
  return place === '' ? name : `${name} · ${place}`;
}

export const stepLabel = (step: keyof typeof HANDOVER_STEP_LABELS): string => HANDOVER_STEP_LABELS[step];

export const MODE_LABELS: Readonly<Record<SessionMode, string>> = {
  in_person: 'In person',
  online: 'Online',
};

/** "12 Nov 2026, 18:00-20:00". */
export function sessionWhenText(s: Pick<StaffSession, 'startsAt' | 'endsAt'>): string {
  return `${dayText(dubaiDate(s.startsAt))}, ${dubaiClock(s.startsAt)}-${dubaiClock(s.endsAt)}`;
}

export function seatsText(s: Pick<StaffSession, 'seats' | 'booked'>): string {
  return s.booked >= s.seats
    ? `Full (${String(s.seats)} seats)`
    : `${String(s.booked)} of ${String(s.seats)} seats booked`;
}

export interface SessionForm {
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly from: string;
  readonly to: string;
  readonly mode: SessionMode;
  readonly place: string;
  readonly seats: string;
}

export const EMPTY_SESSION_FORM: SessionForm = {
  title: '',
  description: '',
  date: '',
  from: '18:00',
  to: '20:00',
  mode: 'in_person',
  place: '',
  seats: '30',
};

/** The form filled from an existing session (Dubai date and times). */
export function formOf(s: StaffSession): SessionForm {
  return {
    title: s.title,
    description: s.description,
    date: dubaiDate(s.startsAt),
    from: dubaiClock(s.startsAt),
    to: dubaiClock(s.endsAt),
    mode: s.mode,
    place: s.place,
    seats: String(s.seats),
  };
}

/** The API body for the form, or the first problem in plain words. */
export function sessionBodyOf(f: SessionForm): { body: EducationSessionBody } | { problem: string } {
  const startsAt = dubaiInstant(f.date, f.from);
  const endsAt = dubaiInstant(f.date, f.to);
  if (startsAt === null || endsAt === null) return { problem: 'Give the date, and the start and end times.' };
  const parsed = educationSessionBody.safeParse({
    title: f.title,
    description: f.description,
    startsAt,
    endsAt,
    mode: f.mode,
    place: f.place,
    seats: Number(f.seats),
  });
  if (!parsed.success) return { problem: parsed.error.issues[0]?.message ?? 'Check the session.' };
  return { body: parsed.data };
}

/** The bookings of a session as CSV (spreadsheet-safe cells), seats given back left out. */
export function bookingsCsv(session: StaffSession, bookings: StaffBookings['bookings']): string {
  return toCsv([
    ['Session', 'Date', 'Owner', 'Booked', 'Attended'],
    ...bookings
      .filter((b) => b.cancelledAt === null)
      .map((b) => [
        session.title,
        sessionWhenText(session),
        b.owner.name ?? 'Name not on file',
        dateTime(b.bookedAt),
        b.attendedAt === null ? 'No' : 'Yes',
      ]),
  ]);
}
