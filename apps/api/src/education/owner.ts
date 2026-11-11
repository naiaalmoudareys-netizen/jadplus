/**
 * Investor education for owners (O5, S4; ADR 0033). Owners only: a tenant never sees it (R2).
 * - GET  /api/education                        the next date, upcoming sessions with seats left and the owner's seat,
 *                                              and the owner's book request
 * - POST /api/education/sessions/:id/seat      reserve a seat (one per owner per session; "Full" when none is left)
 * - POST /api/education/sessions/:id/seat/cancel  give the seat back, until the session starts
 * - POST /api/education/book                   "Send me the book" (one copy per owner)
 * A seat is taken in one statement that fails when the session is full, so two owners booking the last seat at
 * once cannot both get it (migration 0030). Every change is audited in the same batch (C-AUD-1).
 */
import {
  SEAT_MESSAGES,
  canCancelSeat,
  nextSession,
  platformIdParam,
  seatRefusal,
  seatsLeft,
  shownPlace,
  type OwnerEducation,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit } from '../partner/company/common.js';
import { parseParams } from '../validate.js';
import {
  SESSION_COLUMNS,
  isFullConflict,
  isUniqueConflict,
  sessionById,
  timesOf,
  type SessionRow,
} from './store.js';

export function ownerEducationRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const owner = requireRole('owner');

  r.get('/education', owner, async (c) => {
    const db = c.env.DB;
    const now = c.get('now');
    const userId = c.get('auth').userId;
    const [sessions, book] = await Promise.all([
      db
        .prepare(
          `SELECT ${SESSION_COLUMNS},
             EXISTS (SELECT 1 FROM education_bookings m
                     WHERE m.session_id = s.id AND m.user_id = ? AND m.cancelled_at IS NULL) AS mine
           FROM education_sessions s WHERE s.ends_at > ? ORDER BY s.starts_at LIMIT 50`,
        )
        .bind(userId, now)
        .all<SessionRow & { mine: number }>(),
      db
        .prepare('SELECT status, requested_at, sent_at FROM education_book_requests WHERE user_id = ?')
        .bind(userId)
        .first<{ status: 'requested' | 'sent'; requested_at: number; sent_at: number | null }>(),
    ]);
    // A cancelled session is shown only to owners who held a seat on it, so they learn it is off.
    const shown = sessions.results.filter((s) => s.cancelled_at === null || s.mine === 1);
    const next = nextSession(
      shown.map((s) => ({ ...timesOf(s), id: s.id })),
      now,
    );
    return c.json({
      nextStartsAt: next?.startsAt ?? null,
      sessions: shown.map((s) => {
        const mySeat = s.mine === 1;
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          mode: s.mode,
          seats: s.seats,
          place: shownPlace(s.mode, s.place, mySeat),
          seatsLeft: seatsLeft(s.seats, s.taken),
          cancelled: s.cancelled_at !== null,
          mySeat,
          canCancel: mySeat && canCancelSeat(timesOf(s), now),
        };
      }),
      book:
        book === null ? null : { status: book.status, requestedAt: book.requested_at, sentAt: book.sent_at },
    } satisfies OwnerEducation);
  });

  r.post('/education/sessions/:id/seat', owner, async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const userId = c.get('auth').userId;
    const s = await sessionById(db, id);
    if (s === null) throw new ApiError(404, 'Not found.');
    const mine = await db
      .prepare(
        'SELECT 1 AS ok FROM education_bookings WHERE session_id = ? AND user_id = ? AND cancelled_at IS NULL',
      )
      .bind(id, userId)
      .first<{ ok: number }>();
    const refusal = seatRefusal({ ...timesOf(s), seats: s.seats }, s.taken, mine !== null, now);
    if (refusal !== null) throw new ApiError(409, SEAT_MESSAGES[refusal], { body: { code: refusal } });
    const bookingId = newId();
    try {
      await db.batch([
        // booked_at becomes 0 (refused by the table's CHECK) if the last seat went in the meantime.
        db
          .prepare(
            `INSERT INTO education_bookings (id, session_id, user_id, booked_at)
             SELECT ?, s.id, ?, CASE WHEN
               (SELECT COUNT(*) FROM education_bookings b WHERE b.session_id = s.id AND b.cancelled_at IS NULL) < s.seats
               THEN ? ELSE 0 END
             FROM education_sessions s WHERE s.id = ?`,
          )
          .bind(bookingId, userId, now, id),
        audit(c, 'education_seat_booked', 'education_booking', bookingId, { sessionId: id }),
      ]);
    } catch (err) {
      if (isFullConflict(err)) throw new ApiError(409, SEAT_MESSAGES.full, { body: { code: 'full' } });
      if (isUniqueConflict(err))
        throw new ApiError(409, SEAT_MESSAGES.already, { body: { code: 'already' } });
      throw err;
    }
    return c.json({ id: bookingId }, 201);
  });

  r.post('/education/sessions/:id/seat/cancel', owner, async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const s = await sessionById(db, id);
    if (s === null) throw new ApiError(404, 'Not found.');
    const booking = await db
      .prepare(
        'SELECT id FROM education_bookings WHERE session_id = ? AND user_id = ? AND cancelled_at IS NULL',
      )
      .bind(id, c.get('auth').userId)
      .first<{ id: string }>();
    if (booking === null) throw new ApiError(404, 'You have no seat on this session.');
    if (!canCancelSeat(timesOf(s), now))
      throw new ApiError(409, 'The session has started; the seat can no longer be given back.');
    await db.batch([
      db
        .prepare('UPDATE education_bookings SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL')
        .bind(now, booking.id),
      audit(c, 'education_seat_cancelled', 'education_booking', booking.id, { sessionId: id }),
    ]);
    return c.json({ id: booking.id });
  });

  r.post('/education/book', owner, async (c) => {
    const db = c.env.DB;
    const id = newId();
    try {
      await db.batch([
        db
          .prepare('INSERT INTO education_book_requests (id, user_id, requested_at) VALUES (?, ?, ?)')
          .bind(id, c.get('auth').userId, c.get('now')),
        audit(c, 'education_book_requested', 'education_book_request', id),
      ]);
    } catch (err) {
      if (isUniqueConflict(err)) throw new ApiError(409, 'You have already asked for the book.');
      throw err;
    }
    return c.json({ id }, 201);
  });

  return r;
}
