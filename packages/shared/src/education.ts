/**
 * Investor education (O5, S4; ADR 0033; service 'education', flow 'booking'). JAD+ Admin, or the education team
 * (the JAD Global team assigned to the service), schedules sessions; owners reserve a seat (one per owner per
 * session, cancel until the start) and can ask for a copy of the book (one per owner; staff mark it sent).
 *
 * A full session shows "Full": there is no waiting list (a seat freed by a cancellation is open to anyone again).
 * Tenants never see this (R2: education is the owner's service).
 */
import { z } from 'zod';
import { plainText } from './admin-platform.js';

/** Mirrors the CHECK list on education_sessions.mode (migration 0030). */
export const SESSION_MODES = ['in_person', 'online'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

/** Mirrors the CHECK list on education_book_requests.status (migration 0030). */
export const BOOK_REQUEST_STATUSES = ['requested', 'sent'] as const;
export type BookRequestStatus = (typeof BOOK_REQUEST_STATUSES)[number];

export const SESSION_SEATS_MAX = 500;
/** A session lasts at most this long (a half-day seminar). */
export const SESSION_MAX_HOURS = 12;
const HOUR_MS = 3_600_000;

export interface EducationTimes {
  readonly startsAt: number;
  readonly endsAt: number;
  readonly cancelledAt: number | null;
}

export function seatsLeft(seats: number, taken: number): number {
  return Math.max(0, seats - taken);
}

/** The session owners should see first: the next one that has not started and is not cancelled. */
export function nextSession<S extends EducationTimes>(sessions: readonly S[], now: number): S | null {
  return (
    [...sessions]
      .filter((s) => s.cancelledAt === null && s.startsAt > now)
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}

export type SeatRefusal = 'cancelled' | 'started' | 'full' | 'already';

/** O5: whether this owner may reserve a seat now, or why not. */
export function seatRefusal(
  session: EducationTimes & { readonly seats: number },
  taken: number,
  alreadyMine: boolean,
  now: number,
): SeatRefusal | null {
  if (session.cancelledAt !== null) return 'cancelled';
  if (now >= session.startsAt) return 'started';
  if (alreadyMine) return 'already';
  if (taken >= session.seats) return 'full';
  return null;
}

export const SEAT_MESSAGES: Readonly<Record<SeatRefusal, string>> = {
  cancelled: 'This session was cancelled.',
  started: 'This session has already started.',
  full: 'This session is full.',
  already: 'You already have a seat on this session.',
};

/** O5: an owner may give back a seat until the session starts. */
export function canCancelSeat(session: EducationTimes, now: number): boolean {
  return session.cancelledAt === null && now < session.startsAt;
}

/** O5: attendance is marked once the session has started, on a seat that was not given back. */
export function canMarkAttendance(session: EducationTimes, now: number): boolean {
  return session.cancelledAt === null && now >= session.startsAt;
}

/**
 * The place owners see: an address for a session in person (everyone); for an online session the joining link,
 * only to owners holding a seat (null for others).
 */
export function shownPlace(mode: SessionMode, place: string, hasSeat: boolean): string | null {
  return mode === 'in_person' || hasSeat ? place : null;
}

/** An online session's link: https only, no spaces (it becomes a tappable link in the app). */
export function isSessionLink(s: string): boolean {
  return /^https:\/\/[^\s<>"']{3,290}$/.test(s);
}

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

/** POST /api/{admin|partner}/education/sessions and PUT .../sessions/:id. Times are UTC milliseconds. */
export const educationSessionBody = z
  .strictObject({
    title: plainText(120),
    description: plainText(2000),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    mode: z.enum(SESSION_MODES),
    place: plainText(300),
    seats: z.number().int().min(1).max(SESSION_SEATS_MAX),
  })
  .refine((b) => b.endsAt > b.startsAt, { message: 'The end must be after the start.', path: ['endsAt'] })
  .refine((b) => b.endsAt - b.startsAt <= SESSION_MAX_HOURS * HOUR_MS, {
    message: `A session lasts at most ${String(SESSION_MAX_HOURS)} hours.`,
    path: ['endsAt'],
  })
  .refine((b) => b.mode === 'in_person' || isSessionLink(b.place), {
    message: 'For an online session, give the https:// joining link.',
    path: ['place'],
  });
export type EducationSessionBody = z.infer<typeof educationSessionBody>;

/** POST /api/{admin|partner}/education/bookings/:id/attendance. */
export const attendanceBody = z.strictObject({ attended: z.boolean() });

const sessionFields = {
  id: z.string(),
  title: z.string(),
  description: z.string(),
  startsAt: z.number(),
  endsAt: z.number(),
  mode: z.enum(SESSION_MODES),
  seats: z.number(),
};

const bookView = z
  .object({
    status: z.enum(BOOK_REQUEST_STATUSES),
    requestedAt: z.number(),
    sentAt: z.number().nullable(),
  })
  .nullable();

/** GET /api/education (owners). */
export const ownerEducationResponse = z.object({
  /** The next session's start, or null: "Next date to be announced". */
  nextStartsAt: z.number().nullable(),
  sessions: z.array(
    z.object({
      ...sessionFields,
      /** Address (in person), or the joining link for an owner holding a seat (online); else null. */
      place: z.string().nullable(),
      seatsLeft: z.number(),
      cancelled: z.boolean(),
      mySeat: z.boolean(),
      canCancel: z.boolean(),
    }),
  ),
  book: bookView,
});
export type OwnerEducation = z.infer<typeof ownerEducationResponse>;
export type OwnerSession = OwnerEducation['sessions'][number];

/** GET /api/{admin|partner}/education/sessions. */
export const staffSessionsResponse = z.object({
  /** False for a JAD+ viewer, or an office that is not the education team (it sees nothing). */
  canManage: z.boolean(),
  sessions: z.array(
    z.object({
      ...sessionFields,
      place: z.string(),
      booked: z.number(),
      attended: z.number(),
      cancelledAt: z.number().nullable(),
      createdAt: z.number(),
    }),
  ),
});
export type StaffSessions = z.infer<typeof staffSessionsResponse>;
export type StaffSession = StaffSessions['sessions'][number];

const ownerRef = z.object({ userId: z.string(), name: z.string().nullable() });

/** GET /api/{admin|partner}/education/sessions/:id/bookings (owners' names: audited). */
export const staffBookingsResponse = z.object({
  bookings: z.array(
    z.object({
      id: z.string(),
      owner: ownerRef,
      bookedAt: z.number(),
      cancelledAt: z.number().nullable(),
      attendedAt: z.number().nullable(),
    }),
  ),
});
export type StaffBookings = z.infer<typeof staffBookingsResponse>;

/** GET /api/{admin|partner}/education/books (owners' names: audited). */
export const staffBookRequestsResponse = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      owner: ownerRef,
      requestedAt: z.number(),
      status: z.enum(BOOK_REQUEST_STATUSES),
      sentAt: z.number().nullable(),
    }),
  ),
});
export type StaffBookRequests = z.infer<typeof staffBookRequestsResponse>;

export const educationChangedResponse = z.object({ id: z.string() });
