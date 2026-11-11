/**
 * UAE public holidays kept by JAD+ Admin (BUILD_SPEC E20, S4; ADR 0028). Islamic holiday dates are only
 * confirmed close to the day, so this is the one setting changed in the console rather than in a release.
 * - GET    /api/admin/holidays         every holiday on file, oldest first, with whether it can still change
 * - POST   /api/admin/holidays         add a holiday { date, name } for a day after today (Dubai)
 * - DELETE /api/admin/holidays/:date   remove a holiday after today (the audit log keeps its date and name)
 * Reading: jad_admin and jad_viewer. Changing: jad_admin only. Today and past days never change, so clocks
 * already running and past figures stay fair (shared holidayChangeProblem). Every change is audited (C-AUD-1).
 */
import {
  HOLIDAY_PROBLEM_TEXT,
  dubaiDate,
  holidayBody,
  holidayChangeProblem,
  holidayDateParam,
  holidayEditable,
  type AdminHolidays,
  type HolidayProblem,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { loadHolidays } from '../../calendar.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody, parseParams } from '../../validate.js';
import { CHANGERS, READERS, audit } from './common.js';

const PROBLEM_STATUS: Readonly<Record<HolidayProblem, 404 | 409 | 422>> = {
  not_future: 422,
  already_holiday: 409,
  not_holiday: 404,
};

function refuse(problem: HolidayProblem): never {
  throw new ApiError(PROBLEM_STATUS[problem], HOLIDAY_PROBLEM_TEXT[problem], { body: { code: problem } });
}

export function platformHolidayRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/holidays', requireRole(...READERS), async (c) => {
    const today = dubaiDate(c.get('now'));
    const rows = await loadHolidays(c.env.DB);
    return c.json({
      today,
      holidays: rows.map((h) => ({
        date: h.date,
        name: h.name,
        editable: holidayEditable(h.date, today),
        addedAt: h.added_at,
      })),
    } satisfies AdminHolidays);
  });

  r.post('/holidays', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, holidayBody);
    const db = c.env.DB;
    const now = c.get('now');
    const onFile = new Set((await loadHolidays(db)).map((h) => h.date));
    const problem = holidayChangeProblem({ kind: 'add', date: body.date }, dubaiDate(now), onFile);
    if (problem !== null) refuse(problem);
    try {
      await db.batch([
        db
          .prepare('INSERT INTO holidays (date, name, added_by, added_at) VALUES (?, ?, ?, ?)')
          .bind(body.date, body.name, c.get('auth').userId, now),
        audit(c, 'holiday_added', 'holiday', body.date, { date: body.date, name: body.name }),
      ]);
    } catch (err) {
      // Added by someone else a moment ago: the primary key refuses it and the batch (with its audit) rolls back.
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) refuse('already_holiday');
      throw err;
    }
    return c.json({ date: body.date, name: body.name, removed: false }, 201);
  });

  r.delete('/holidays/:date', requireRole(...CHANGERS), async (c) => {
    const { date } = parseParams(c, holidayDateParam);
    const db = c.env.DB;
    const row = await db
      .prepare('SELECT name FROM holidays WHERE date = ?')
      .bind(date)
      .first<{ name: string }>();
    const onFile = new Set(row === null ? [] : [date]);
    const problem = holidayChangeProblem({ kind: 'remove', date }, dubaiDate(c.get('now')), onFile);
    if (problem !== null || row === null) refuse(problem ?? 'not_holiday');
    await db.batch([
      db.prepare('DELETE FROM holidays WHERE date = ?').bind(date),
      audit(c, 'holiday_removed', 'holiday', date, { date, name: row.name }),
    ]);
    return c.json({ date, name: row.name, removed: true });
  });

  return r;
}
