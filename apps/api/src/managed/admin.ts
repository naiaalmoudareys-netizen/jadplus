/**
 * Managed units for JAD+ Admin (ADR 0034; O4, C-AZ-1, C-AUD-1). Mounted at /api/admin; roles per route.
 *
 * - GET  /managed-units?providerId=&ownerUserId=&sfUnitId=   arrangements, current and past (admin and viewers)
 * - POST /managed-units                                       set one unit as managed (person page / unit)
 * - POST /managed-units/:id/end                               end an arrangement now (history kept)
 * - POST /managed-units/bulk                                  units sold with complimentary management: unit
 *                                                             name + owner's email + until date per row, one
 *                                                             JAD Global team; all rows or none
 * - GET  /manager-settings/:providerId, PUT                   the team's maintenance company
 *
 * The managing provider must be a JAD Global team (ADR 0030); the owner must own the unit on Salesforce's list
 * (owner_units). Every change is audited in the same batch; the audit log holds ids and dates, never names or
 * emails.
 */
import {
  bulkManagedBody,
  dubaiDate,
  idSchema,
  isManagedOn,
  maintenancePartnerBody,
  managedIdParam,
  managementDatesAllowed,
  providerIdParam,
  setManagedBody,
  type ArrangementView,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/middleware.js';
import { blindIndex, newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams, parseQuery } from '../validate.js';
import { maintenanceSetting, saveMaintenanceSetting } from './settings.js';
import {
  MANAGED_SELECT,
  arrangementView,
  facts,
  managedAudit,
  openArrangement,
  startArrangementStatements,
  type ManagedRow,
} from './store.js';

type Ctx = Context<AppEnv>;

const listQuery = z.strictObject({
  providerId: idSchema.optional(),
  ownerUserId: idSchema.optional(),
  sfUnitId: z
    .string()
    .regex(/^[A-Za-z0-9]{15,18}$/)
    .optional(),
});

/** The provider if it is a JAD Global team that has not left, else 400. */
async function managingTeam(c: Ctx, providerId: string): Promise<void> {
  const p = await c.env.DB.prepare(
    "SELECT 1 AS yes FROM partners WHERE id = ? AND kind = 'jad_group' AND status <> 'ended'",
  )
    .bind(providerId)
    .first();
  if (p === null) throw new ApiError(400, 'Choose a JAD Global property management team.');
}

/** Whether the unit has an arrangement in force (an expired one is ended by startArrangementStatements). */
async function inForce(c: Ctx, sfUnitId: string): Promise<boolean> {
  const open = await openArrangement(c.env.DB, sfUnitId);
  return open !== null && isManagedOn(facts(open), dubaiDate(c.get('now')));
}

export function managedAdminRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const read = requireRole('jad_admin', 'jad_viewer');
  const admin = requireRole('jad_admin');

  r.get('/managed-units', read, async (c) => {
    const q = parseQuery(c, listQuery);
    const today = dubaiDate(c.get('now'));
    const { results } = await c.env.DB.prepare(
      `${MANAGED_SELECT} WHERE (?1 IS NULL OR m.provider_id = ?1) AND (?2 IS NULL OR m.owner_user_id = ?2)
         AND (?3 IS NULL OR m.sf_unit_id = ?3)
       ORDER BY m.ended_at IS NOT NULL, unit_name, m.set_at DESC LIMIT 500`,
    )
      .bind(q.providerId ?? null, q.ownerUserId ?? null, q.sfUnitId ?? null)
      .all<ManagedRow>();
    const units: (ArrangementView & { ownerUserId: string })[] = results.map((m) => ({
      ...arrangementView(m, today),
      ownerUserId: m.owner_user_id,
    }));
    return c.json({ units });
  });

  r.post('/managed-units', admin, async (c) => {
    const body = await parseJsonBody(c, setManagedBody);
    const db = c.env.DB;
    if (!managementDatesAllowed(body.since, body.until, dubaiDate(c.get('now')))) {
      throw new ApiError(400, 'Check the dates: from today or earlier, ending after today, at most 5 years.');
    }
    await managingTeam(c, body.providerId);
    const owns = await db
      .prepare('SELECT 1 AS yes FROM owner_units WHERE user_id = ? AND sf_unit_id = ?')
      .bind(body.ownerUserId, body.sfUnitId)
      .first();
    if (owns === null) throw new ApiError(404, 'This person does not own this unit.');
    if (await inForce(c, body.sfUnitId)) {
      throw new ApiError(409, 'This unit is already managed. End that first.');
    }
    const id = newId();
    await db.batch([
      ...startArrangementStatements(c, {
        id,
        sfUnitId: body.sfUnitId,
        ownerUserId: body.ownerUserId,
        providerId: body.providerId,
        source: 'admin',
        requestId: null,
        since: body.since,
        until: body.until,
      }),
      managedAudit(c, 'managed_unit_set', 'managed_unit', id, {
        source: 'admin',
        provider: body.providerId,
        until: body.until,
      }),
    ]);
    return c.json({ id }, 201);
  });

  r.post('/managed-units/:id/end', admin, async (c) => {
    const { id } = parseParams(c, managedIdParam);
    const db = c.env.DB;
    const now = c.get('now');
    const m = await db
      .prepare('SELECT ended_at FROM managed_units WHERE id = ?')
      .bind(id)
      .first<{ ended_at: number | null }>();
    if (m === null) throw new ApiError(404, 'Not found.');
    if (m.ended_at !== null) throw new ApiError(409, 'This arrangement has already ended.');
    await db.batch([
      db
        .prepare('UPDATE managed_units SET ended_at = ?, ended_by = ? WHERE id = ? AND ended_at IS NULL')
        .bind(now, c.get('auth').userId, id),
      managedAudit(c, 'managed_unit_ended', 'managed_unit', id),
    ]);
    return c.json({ id, endedAt: now });
  });

  r.post('/managed-units/bulk', admin, async (c) => {
    const body = await parseJsonBody(c, bulkManagedBody);
    const db = c.env.DB;
    const today = dubaiDate(c.get('now'));
    await managingTeam(c, body.providerId);
    const problems: { row: number; problem: string }[] = [];
    const found: { sfUnitId: string; ownerUserId: string; until: string }[] = [];
    const seen = new Set<string>();
    for (const [i, row] of body.rows.entries()) {
      const n = i + 1;
      if (!managementDatesAllowed(today, row.until, today)) {
        problems.push({ row: n, problem: 'The until date must be after today, at most 5 years ahead.' });
        continue;
      }
      const hash = await blindIndex(c.get('keys'), 'email', row.ownerEmail);
      const unit = await db
        .prepare(
          `SELECT ou.user_id, ou.sf_unit_id FROM owner_units ou JOIN users u ON u.id = ou.user_id
           WHERE u.email_hash = ? AND ou.unit_name = ? COLLATE NOCASE`,
        )
        .bind(hash, row.unitName)
        .first<{ user_id: string; sf_unit_id: string }>();
      if (unit === null) {
        problems.push({
          row: n,
          problem: 'No owner with this email owns this unit (they sign in once first).',
        });
        continue;
      }
      if (seen.has(unit.sf_unit_id)) {
        problems.push({ row: n, problem: 'This unit is listed twice.' });
        continue;
      }
      seen.add(unit.sf_unit_id);
      if (await inForce(c, unit.sf_unit_id)) {
        problems.push({ row: n, problem: 'This unit is already managed.' });
        continue;
      }
      found.push({ sfUnitId: unit.sf_unit_id, ownerUserId: unit.user_id, until: row.until });
    }
    if (problems.length > 0) {
      throw new ApiError(400, 'Nothing was saved. Correct these rows and send the list again.', {
        body: { problems },
      });
    }
    await db.batch([
      ...found.flatMap((u) => {
        const id = newId();
        return [
          ...startArrangementStatements(c, {
            id,
            sfUnitId: u.sfUnitId,
            ownerUserId: u.ownerUserId,
            providerId: body.providerId,
            source: 'complimentary',
            requestId: null,
            since: today,
            until: u.until,
          }),
          managedAudit(c, 'managed_unit_set', 'managed_unit', id, {
            source: 'complimentary',
            provider: body.providerId,
            until: u.until,
          }),
        ];
      }),
      managedAudit(c, 'managed_units_bulk_added', 'partner', body.providerId, { rows: found.length }),
    ]);
    return c.json({ added: found.length }, 201);
  });

  r.get('/manager-settings/:providerId', read, async (c) => {
    const { providerId } = parseParams(c, providerIdParam);
    return c.json(await maintenanceSetting(c.env.DB, providerId));
  });

  r.put('/manager-settings/:providerId', admin, async (c) => {
    const { providerId } = parseParams(c, providerIdParam);
    const body = await parseJsonBody(c, maintenancePartnerBody);
    await managingTeam(c, providerId);
    await saveMaintenanceSetting(c, providerId, body.partnerId);
    return c.json(await maintenanceSetting(c.env.DB, providerId));
  });

  return r;
}
