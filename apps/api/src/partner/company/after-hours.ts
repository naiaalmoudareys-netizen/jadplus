/**
 * After-hours contact (ADR 0025; E5-E7): who in the partner's team takes emergency calls out of hours, per
 * week starting Monday (Dubai).
 *
 * - GET /api/partner/after-hours?from=YYYY-MM-DD   8 weeks from that Monday (default this week); the office
 *                                                  and its technicians (so they know who is on duty)
 * - PUT /api/partner/after-hours                   office: {weekStarting, technicianId} (null clears the week);
 *                                                  this week or later only
 */
import { afterHoursQuery, dubaiDate, setAfterHoursBody, weekStarting, weeksFrom } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody, parseQuery } from '../../validate.js';
import { activeTeam, audit, companyOf, companyTechnician, type Ctx } from './common.js';

const WEEKS = 8;

async function weeks(c: Ctx, from: string) {
  const partnerId = companyOf(c);
  const list = weeksFrom(from, WEEKS);
  const { results } = await c.env.DB.prepare(
    'SELECT week_starting, technician_id FROM partner_after_hours WHERE partner_id = ? AND week_starting >= ? AND week_starting <= ?',
  )
    .bind(partnerId, list[0] ?? from, list.at(-1) ?? from)
    .all<{ week_starting: string; technician_id: string }>();
  const names = new Map((await activeTeam(c, partnerId)).map((t) => [t.id, t.name]));
  return {
    weeks: list.map((week) => {
      const techId = results.find((w) => w.week_starting === week)?.technician_id ?? null;
      return {
        weekStarting: week,
        technicianId: techId,
        name: techId === null ? null : (names.get(techId) ?? 'Former team member'),
      };
    }),
  };
}

export function registerAfterHours(r: Hono<AppEnv>): void {
  r.get('/after-hours', requireRole('partner_admin', 'partner'), async (c) => {
    const { from } = parseQuery(c, afterHoursQuery);
    return c.json(await weeks(c, from ?? weekStarting(dubaiDate(c.get('now')))));
  });

  r.put('/after-hours', requireRole('partner_admin'), async (c) => {
    const body = await parseJsonBody(c, setAfterHoursBody);
    const partnerId = companyOf(c);
    if (body.weekStarting < weekStarting(dubaiDate(c.get('now')))) {
      throw new ApiError(400, 'Past weeks cannot be changed.');
    }
    const db = c.env.DB;
    const change =
      body.technicianId === null
        ? db
            .prepare('DELETE FROM partner_after_hours WHERE partner_id = ? AND week_starting = ?')
            .bind(partnerId, body.weekStarting)
        : db
            .prepare(
              `INSERT INTO partner_after_hours (partner_id, week_starting, technician_id, set_by, set_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (partner_id, week_starting) DO UPDATE SET technician_id = excluded.technician_id,
                 set_by = excluded.set_by, set_at = excluded.set_at`,
            )
            .bind(
              partnerId,
              body.weekStarting,
              (await companyTechnician(c, body.technicianId, { selfAllowed: false, activeOnly: true })).id,
              c.get('auth').userId,
              c.get('now'),
            );
    await db.batch([
      change,
      audit(c, 'after_hours_contact_set', 'partner', partnerId, {
        week: body.weekStarting,
        cleared: body.technicianId === null,
      }),
    ]);
    return c.json(await weeks(c, body.weekStarting));
  });
}
