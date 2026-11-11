/**
 * GET /api/calendar (every signed-in person, any role; ADR 0028): today (Dubai) and the public holidays from
 * today on, so the apps offer the same working days the API accepts (E20, ADR 0013). No personal data.
 */
import { ROLES, dubaiDate, type CalendarAnswer, type UserRole } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { loadHolidaysFrom } from '../calendar.js';
import type { AppEnv } from '../env.js';

const EVERY_ROLE: readonly UserRole[] = ROLES.filter((r): r is UserRole => r !== 'system');

export function calendarRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get('/calendar', requireRole(...EVERY_ROLE), async (c) => {
    const today = dubaiDate(c.get('now'));
    const holidays = await loadHolidaysFrom(c.env.DB, today);
    return c.json({ today, holidays } satisfies CalendarAnswer);
  });
  return r;
}
