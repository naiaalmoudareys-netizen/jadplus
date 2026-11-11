/**
 * Investor education for staff (O5; ADR 0033). Mounted under /api/admin (JAD+ Admin changes, jad_viewer reads) and
 * /api/partner (the partner office of the education team: the JAD Global team assigned to the service).
 *
 * - GET  /education/sessions                 sessions (future, and the last 90 days) with seats booked and attended
 * - POST /education/sessions                 schedule one (title, description, times, in person or online, seats)
 * - PUT  /education/sessions/:id             change it before it starts (never below the seats already booked)
 * - POST /education/sessions/:id/cancel      cancel it before it starts (owners holding a seat see "Cancelled")
 * - GET  /education/sessions/:id/bookings    who booked (owners' names: audited)
 * - POST /education/bookings/:id/attendance  mark attended (or not) once the session has started
 * - GET  /education/books                    book requests (owners' names: audited)
 * - POST /education/books/:id/sent           the book was sent
 * Every change is audited in the same batch (C-AUD-1).
 */
import {
  attendanceBody,
  canMarkAttendance,
  educationSessionBody,
  platformIdParam,
  type StaffBookRequests,
  type StaffBookings,
  type StaffSessions,
} from '@jadplus/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit } from '../partner/company/common.js';
import { parseJsonBody, parseParams } from '../validate.js';
import {
  SESSION_COLUMNS,
  isEducationTeam,
  ownerName,
  sessionById,
  timesOf,
  type SessionRow,
} from './store.js';

type Ctx = Context<AppEnv>;
export type StaffScope = 'admin' | 'office';

const DAY = 86_400_000;
/** How far back the staff list goes (attendance is marked after a session). */
const PAST_DAYS = 90;

/** Whether the signed-in person may change education data in this scope. */
async function mayManage(c: Ctx, scope: StaffScope): Promise<boolean> {
  const { role, partnerId } = c.get('auth');
  if (scope === 'admin') return role === 'jad_admin';
  return partnerId !== null && (await isEducationTeam(c.env.DB, partnerId));
}

/** Readers: JAD+ Admin and viewers; in the office, only the education team (others get 403). */
async function requireReader(c: Ctx, scope: StaffScope): Promise<void> {
  if (scope === 'office' && !(await mayManage(c, scope))) throw new ApiError(403, 'Not allowed.');
}

async function requireManager(c: Ctx, scope: StaffScope): Promise<void> {
  if (!(await mayManage(c, scope))) throw new ApiError(403, 'Not allowed.');
}

async function liveSession(c: Ctx, id: string): Promise<SessionRow> {
  const s = await sessionById(c.env.DB, id);
  if (s === null) throw new ApiError(404, 'Not found.');
  if (s.cancelled_at !== null) throw new ApiError(409, 'This session was cancelled.');
  if (c.get('now') >= s.starts_at) throw new ApiError(409, 'This session has already started.');
  return s;
}

export function educationStaffRoutes(scope: StaffScope): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  // Per route, not r.use('*'): these sub-apps are mounted at /api/partner and /api/admin beside other routes.
  const read: MiddlewareHandler<AppEnv> =
    scope === 'admin' ? requireRole('jad_admin', 'jad_viewer') : requireRole('partner_admin');

  r.get('/education/sessions', read, async (c) => {
    const canManage = await mayManage(c, scope);
    if (scope === 'office' && !canManage) return c.json({ canManage, sessions: [] } satisfies StaffSessions);
    const { results } = await c.env.DB.prepare(
      `SELECT ${SESSION_COLUMNS},
         (SELECT COUNT(*) FROM education_bookings b WHERE b.session_id = s.id AND b.attended_at IS NOT NULL) AS attended
       FROM education_sessions s WHERE s.ends_at > ? ORDER BY s.starts_at DESC LIMIT 200`,
    )
      .bind(c.get('now') - PAST_DAYS * DAY)
      .all<SessionRow & { attended: number }>();
    return c.json({
      canManage,
      sessions: results.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        mode: s.mode,
        place: s.place,
        seats: s.seats,
        booked: s.taken,
        attended: s.attended,
        cancelledAt: s.cancelled_at,
        createdAt: s.created_at,
      })),
    } satisfies StaffSessions);
  });

  r.post('/education/sessions', read, async (c) => {
    await requireManager(c, scope);
    const body = await parseJsonBody(c, educationSessionBody);
    const now = c.get('now');
    if (body.startsAt <= now) throw new ApiError(422, 'The session must start in the future.');
    const db = c.env.DB;
    const id = newId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO education_sessions
             (id, title, description, starts_at, ends_at, mode, place, seats, created_at, created_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          body.title,
          body.description,
          body.startsAt,
          body.endsAt,
          body.mode,
          body.place,
          body.seats,
          now,
          c.get('auth').userId,
          now,
        ),
      audit(c, 'education_session_created', 'education_session', id, {
        startsAt: body.startsAt,
        mode: body.mode,
        seats: body.seats,
      }),
    ]);
    return c.json({ id }, 201);
  });

  r.put('/education/sessions/:id', read, async (c) => {
    await requireManager(c, scope);
    const { id } = parseParams(c, platformIdParam);
    const body = await parseJsonBody(c, educationSessionBody);
    const now = c.get('now');
    const s = await liveSession(c, id);
    if (body.startsAt <= now) throw new ApiError(422, 'The session must start in the future.');
    if (body.seats < s.taken) {
      throw new ApiError(422, `${String(s.taken)} seats are already booked; keep at least that many.`);
    }
    const db = c.env.DB;
    await db.batch([
      db
        .prepare(
          `UPDATE education_sessions SET title = ?, description = ?, starts_at = ?, ends_at = ?, mode = ?, place = ?,
             seats = ?, updated_at = ?
           WHERE id = ? AND cancelled_at IS NULL`,
        )
        .bind(
          body.title,
          body.description,
          body.startsAt,
          body.endsAt,
          body.mode,
          body.place,
          body.seats,
          now,
          id,
        ),
      audit(c, 'education_session_changed', 'education_session', id, {
        startsAt: body.startsAt,
        mode: body.mode,
        seats: body.seats,
        moved: body.startsAt !== s.starts_at,
      }),
    ]);
    return c.json({ id });
  });

  r.post('/education/sessions/:id/cancel', read, async (c) => {
    await requireManager(c, scope);
    const { id } = parseParams(c, platformIdParam);
    const s = await liveSession(c, id);
    const db = c.env.DB;
    const now = c.get('now');
    await db.batch([
      db
        .prepare(
          'UPDATE education_sessions SET cancelled_at = ?, updated_at = ? WHERE id = ? AND cancelled_at IS NULL',
        )
        .bind(now, now, id),
      audit(c, 'education_session_cancelled', 'education_session', id, { seatsHeld: s.taken }),
    ]);
    return c.json({ id });
  });

  r.get('/education/sessions/:id/bookings', read, async (c) => {
    await requireReader(c, scope);
    const { id } = parseParams(c, platformIdParam);
    if ((await sessionById(c.env.DB, id)) === null) throw new ApiError(404, 'Not found.');
    const { results } = await c.env.DB.prepare(
      `SELECT b.id, b.user_id, u.name_enc, b.booked_at, b.cancelled_at, b.attended_at
       FROM education_bookings b JOIN users u ON u.id = b.user_id
       WHERE b.session_id = ? ORDER BY b.booked_at`,
    )
      .bind(id)
      .all<{
        id: string;
        user_id: string;
        name_enc: Uint8Array | null;
        booked_at: number;
        cancelled_at: number | null;
        attended_at: number | null;
      }>();
    const keys = c.get('keys');
    const bookings: StaffBookings['bookings'] = await Promise.all(
      results.map(async (b) => ({
        id: b.id,
        owner: { userId: b.user_id, name: await ownerName(keys, b.user_id, b.name_enc) },
        bookedAt: b.booked_at,
        cancelledAt: b.cancelled_at,
        attendedAt: b.attended_at,
      })),
    );
    // Owners' names on screen: the read is audited (ADR 0025).
    await audit(c, 'education_bookings_viewed', 'education_session', id, { count: bookings.length }).run();
    return c.json({ bookings } satisfies StaffBookings);
  });

  r.post('/education/bookings/:id/attendance', read, async (c) => {
    await requireManager(c, scope);
    const { id } = parseParams(c, platformIdParam);
    const { attended } = await parseJsonBody(c, attendanceBody);
    const db = c.env.DB;
    const now = c.get('now');
    const booking = await db
      .prepare('SELECT session_id, cancelled_at FROM education_bookings WHERE id = ?')
      .bind(id)
      .first<{ session_id: string; cancelled_at: number | null }>();
    if (booking === null) throw new ApiError(404, 'Not found.');
    const s = await sessionById(db, booking.session_id);
    if (s === null) throw new ApiError(404, 'Not found.');
    if (booking.cancelled_at !== null) throw new ApiError(409, 'This seat was given back.');
    if (!canMarkAttendance(timesOf(s), now)) {
      throw new ApiError(409, 'Attendance is marked once the session has started.');
    }
    await db.batch([
      db
        .prepare('UPDATE education_bookings SET attended_at = ? WHERE id = ?')
        .bind(attended ? now : null, id),
      audit(c, 'education_attendance_marked', 'education_booking', id, { attended }),
    ]);
    return c.json({ id });
  });

  r.get('/education/books', read, async (c) => {
    await requireReader(c, scope);
    const { results } = await c.env.DB.prepare(
      `SELECT q.id, q.user_id, u.name_enc, q.requested_at, q.status, q.sent_at
       FROM education_book_requests q JOIN users u ON u.id = q.user_id
       ORDER BY q.status = 'sent', q.requested_at LIMIT 500`,
    ).all<{
      id: string;
      user_id: string;
      name_enc: Uint8Array | null;
      requested_at: number;
      status: 'requested' | 'sent';
      sent_at: number | null;
    }>();
    const keys = c.get('keys');
    const requests: StaffBookRequests['requests'] = await Promise.all(
      results.map(async (q) => ({
        id: q.id,
        owner: { userId: q.user_id, name: await ownerName(keys, q.user_id, q.name_enc) },
        requestedAt: q.requested_at,
        status: q.status,
        sentAt: q.sent_at,
      })),
    );
    await audit(c, 'education_book_requests_viewed', 'education_books', 'all', {
      count: requests.length,
    }).run();
    return c.json({ requests } satisfies StaffBookRequests);
  });

  r.post('/education/books/:id/sent', read, async (c) => {
    await requireManager(c, scope);
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const row = await db
      .prepare('SELECT status FROM education_book_requests WHERE id = ?')
      .bind(id)
      .first<{ status: string }>();
    if (row === null) throw new ApiError(404, 'Not found.');
    if (row.status === 'sent') throw new ApiError(409, 'Already marked sent.');
    await db.batch([
      db
        .prepare(
          "UPDATE education_book_requests SET status = 'sent', sent_at = ?, sent_by = ? WHERE id = ? AND status = 'requested'",
        )
        .bind(now, c.get('auth').userId, id),
      audit(c, 'education_book_sent', 'education_book_request', id),
    ]);
    return c.json({ id });
  });

  return r;
}
