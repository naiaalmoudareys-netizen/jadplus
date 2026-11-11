/**
 * Dispatch (ADR 0025; R3, E4, E17): technicians' skills and days away, and the day plan.
 *
 * - GET    /api/partner/technicians/:id/skills                 office; a technician their own
 * - PUT    /api/partner/technicians/:id/skills                 office: replace the list
 * - GET    /api/partner/technicians/:id/unavailable            office; a technician their own
 * - POST   /api/partner/technicians/:id/unavailable            office: away from / to, with the reason
 * - DELETE /api/partner/technicians/:id/unavailable/:entryId   office
 * - GET    /api/partner/dispatch?date=YYYY-MM-DD               office: each technician's day, jobs nobody is
 *                                                              going to yet, and who could take them
 */
import {
  addDays,
  addUnavailableBody,
  dispatchQuery,
  dubaiDate,
  setSkillsBody,
  skillFor,
  suggestTechnicians,
  technicianParam,
  unavailableEntryParam,
  type Dispatch,
  type EmergencyType,
  type Skill,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { workspacePage } from '../workspace.js';
import { newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { parseJsonBody, parseParams, parseQuery } from '../../validate.js';
import {
  NOT_CONSULTATION,
  OPEN_SQL,
  activeTeam,
  audit,
  companyOf,
  companyTechnician,
  dubaiDay,
  type Ctx,
} from './common.js';

const MIN = 60_000;
/** A sick day may be recorded up to 30 days after it started; history is shown for 90 days. */
const BACKDATE_DAYS = 30;
const HISTORY_DAYS = 90;

type Reason = Dispatch['technicians'][number]['unavailableReason'] & string;

async function skillsOf(c: Ctx, technicianId: string): Promise<Skill[]> {
  const { results } = await c.env.DB.prepare(
    'SELECT skill FROM technician_skills WHERE technician_id = ? ORDER BY skill',
  )
    .bind(technicianId)
    .all<{ skill: Skill }>();
  return results.map((r) => r.skill);
}

async function awayList(c: Ctx, technicianId: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT id, from_date, to_date, reason FROM technician_unavailability
     WHERE technician_id = ? AND to_date >= ? ORDER BY from_date, id`,
  )
    .bind(technicianId, addDays(dubaiDate(c.get('now')), -HISTORY_DAYS))
    .all<{ id: string; from_date: string; to_date: string; reason: Reason }>();
  return {
    technicianId,
    entries: results.map((e) => ({ id: e.id, from: e.from_date, to: e.to_date, reason: e.reason })),
  };
}

async function dayPlan(c: Ctx, partnerId: string, date: string): Promise<Dispatch> {
  const db = c.env.DB;
  const now = c.get('now');
  const day = dubaiDay(date);
  const team = await activeTeam(c, partnerId);
  const { results: skillRows } = await db
    .prepare(
      `SELECT s.technician_id, s.skill FROM technician_skills s JOIN technicians t ON t.id = s.technician_id
       WHERE t.partner_id = ? ORDER BY s.skill`,
    )
    .bind(partnerId)
    .all<{ technician_id: string; skill: Skill }>();
  const { results: awayRows } = await db
    .prepare(
      `SELECT u.technician_id, u.reason FROM technician_unavailability u JOIN technicians t ON t.id = u.technician_id
       WHERE t.partner_id = ? AND u.from_date <= ? AND u.to_date >= ? ORDER BY u.from_date`,
    )
    .bind(partnerId, date, date)
    .all<{ technician_id: string; reason: Reason }>();
  const { results: visitRows } = await db
    .prepare(
      `SELECT v.technician_id, r.id, r.ref, r.emergency_type, ou.building, v.window_start, v.window_end, v.status,
         (SELECT name FROM services WHERE code = r.service_code) AS service
       FROM visits v JOIN requests r ON r.id = v.request_id ${LOCATION_JOIN}
       WHERE r.partner_id = ? AND v.technician_id IS NOT NULL AND v.status <> 'cancelled'
         AND v.window_start >= ? AND v.window_start < ? ORDER BY v.window_start`,
    )
    .bind(partnerId, day.start, day.end)
    .all<{
      technician_id: string;
      id: string;
      ref: string;
      emergency_type: EmergencyType | null;
      building: string | null;
      window_start: number;
      window_end: number;
      status: string;
      service: string | null;
    }>();
  const { results: waiting } = await db
    .prepare(
      `SELECT r.id, r.ref, r.is_emergency, r.emergency_type, r.next_due_at, ou.building,
         (SELECT name FROM services WHERE code = r.service_code) AS service
       FROM requests r ${LOCATION_JOIN}
       WHERE r.partner_id = ? AND r.technician_id IS NULL AND r.status IN (${OPEN_SQL}) AND ${NOT_CONSULTATION}
       ORDER BY r.is_emergency DESC, r.next_due_at IS NULL, r.next_due_at, r.created_at`,
    )
    .bind(partnerId)
    .all<{
      id: string;
      ref: string;
      is_emergency: number;
      emergency_type: EmergencyType | null;
      next_due_at: number | null;
      building: string | null;
      service: string | null;
    }>();

  const away = new Map<string, Reason>();
  for (const a of awayRows) if (!away.has(a.technician_id)) away.set(a.technician_id, a.reason);
  const technicians = team.map((t) => ({
    id: t.id,
    name: t.name,
    skills: skillRows.filter((s) => s.technician_id === t.id).map((s) => s.skill),
    available: !away.has(t.id),
    unavailableReason: away.get(t.id) ?? null,
    visits: visitRows
      .filter((v) => v.technician_id === t.id)
      .map((v) => ({
        requestId: v.id,
        ref: v.ref,
        service: v.service,
        emergencyType: v.emergency_type,
        building: v.building,
        windowStart: v.window_start,
        windowEnd: v.window_end,
        status: v.status,
      })),
  }));
  const candidates = technicians.map((t) => ({ ...t, visits: t.visits.length }));
  return {
    date,
    technicians,
    unassigned: waiting.map((j) => {
      const skill = skillFor(j.emergency_type);
      return {
        id: j.id,
        ref: j.ref,
        emergency: j.is_emergency === 1,
        emergencyType: j.emergency_type,
        service: j.service,
        building: j.building,
        nextDueAt: j.next_due_at,
        minutesLeft: j.next_due_at === null ? null : Math.ceil((j.next_due_at - now) / MIN),
        skill,
        suggested: suggestTechnicians(candidates, skill),
      };
    }),
  };
}

export function registerDispatch(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');
  const officeOrSelf = requireRole('partner_admin', 'partner');

  r.get('/technicians/:id/skills', officeOrSelf, async (c) => {
    const { id } = parseParams(c, technicianParam);
    await companyTechnician(c, id, { selfAllowed: true, activeOnly: false });
    return c.json({ technicianId: id, skills: await skillsOf(c, id) });
  });

  r.put('/technicians/:id/skills', office, async (c) => {
    const { id } = parseParams(c, technicianParam);
    const { skills } = await parseJsonBody(c, setSkillsBody);
    await companyTechnician(c, id, { selfAllowed: false, activeOnly: true });
    const db = c.env.DB;
    await db.batch([
      db.prepare('DELETE FROM technician_skills WHERE technician_id = ?').bind(id),
      ...skills.map((s) =>
        db.prepare('INSERT INTO technician_skills (technician_id, skill) VALUES (?, ?)').bind(id, s),
      ),
      audit(c, 'technician_skills_set', 'technician', id, { skills: skills.length }),
    ]);
    return c.json({ technicianId: id, skills: await skillsOf(c, id) });
  });

  r.get('/technicians/:id/unavailable', officeOrSelf, async (c) => {
    const { id } = parseParams(c, technicianParam);
    await companyTechnician(c, id, { selfAllowed: true, activeOnly: false });
    return c.json(await awayList(c, id));
  });

  r.post('/technicians/:id/unavailable', office, async (c) => {
    const { id } = parseParams(c, technicianParam);
    const body = await parseJsonBody(c, addUnavailableBody);
    await companyTechnician(c, id, { selfAllowed: false, activeOnly: true });
    const today = dubaiDate(c.get('now'));
    if (body.to < today || body.from < addDays(today, -BACKDATE_DAYS)) {
      throw new ApiError(
        400,
        `Days away can start at most ${String(BACKDATE_DAYS)} days ago and must not be over.`,
      );
    }
    const entryId = newId();
    const db = c.env.DB;
    await db.batch([
      db
        .prepare(
          `INSERT INTO technician_unavailability (id, technician_id, from_date, to_date, reason, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(entryId, id, body.from, body.to, body.reason, c.get('auth').userId, c.get('now')),
      audit(c, 'technician_unavailable_added', 'technician', id, { reason: body.reason }),
    ]);
    return c.json({ id: entryId }, 201);
  });

  r.delete('/technicians/:id/unavailable/:entryId', office, async (c) => {
    const { id, entryId } = parseParams(c, unavailableEntryParam);
    await companyTechnician(c, id, { selfAllowed: false, activeOnly: false });
    const db = c.env.DB;
    const entry = await db
      .prepare('SELECT id FROM technician_unavailability WHERE id = ? AND technician_id = ?')
      .bind(entryId, id)
      .first<{ id: string }>();
    if (entry === null) throw new ApiError(404, 'Not found.');
    await db.batch([
      db.prepare('DELETE FROM technician_unavailability WHERE id = ?').bind(entryId),
      audit(c, 'technician_unavailable_removed', 'technician', id),
    ]);
    return c.json(await awayList(c, id));
  });

  r.get('/dispatch', office, workspacePage('dispatch'), async (c) => {
    const { date } = parseQuery(c, dispatchQuery);
    return c.json(await dayPlan(c, companyOf(c), date ?? dubaiDate(c.get('now'))));
  });
}
