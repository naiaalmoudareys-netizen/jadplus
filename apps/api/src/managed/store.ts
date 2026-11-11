/**
 * Reading managed units (ADR 0034; O4, A1, C-AZ-2): the arrangement in force on a unit, the managing team's
 * maintenance company, and the arrangement's view. Every query is bound to ids the caller has checked.
 */
import {
  dubaiDate,
  isManagedOn,
  maintenancePartnerFor,
  type ArrangementView,
  type ManagedFacts,
  type ManagedSource,
  type MaintenancePartnerFacts,
  type StatementView,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement, type AuditAction } from '../audit.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';

type Ctx = Context<AppEnv>;

export interface ManagedRow {
  id: string;
  sf_unit_id: string;
  owner_user_id: string;
  provider_id: string;
  provider_name: string;
  source: ManagedSource;
  request_id: string | null;
  since: string;
  until: string | null;
  set_at: number;
  ended_at: number | null;
  unit_name: string | null;
  project: string | null;
}

/** The arrangement columns with the provider's name and the unit's name (from any owner's synced copy). */
export const MANAGED_SELECT = `SELECT m.id, m.sf_unit_id, m.owner_user_id, m.provider_id, p.name AS provider_name,
  m.source, m.request_id, m.since, m.until, m.set_at, m.ended_at,
  (SELECT ou.unit_name FROM owner_units ou WHERE ou.sf_unit_id = m.sf_unit_id ORDER BY ou.synced_at DESC LIMIT 1) AS unit_name,
  (SELECT ou.project FROM owner_units ou WHERE ou.sf_unit_id = m.sf_unit_id ORDER BY ou.synced_at DESC LIMIT 1) AS project
  FROM managed_units m JOIN partners p ON p.id = m.provider_id`;

/**
 * SQL condition: the arrangement `alias` is in force on the Dubai date bound as `?{n}` (isManagedOn). Built from
 * code constants only, never from input.
 */
export function managedNowSql(alias: string, param: string): string {
  return `${alias}.ended_at IS NULL AND ${alias}.since <= ${param} AND (${alias}.until IS NULL OR ${alias}.until >= ${param})`;
}

export const facts = (m: Pick<ManagedRow, 'since' | 'until' | 'ended_at'>): ManagedFacts => ({
  since: m.since,
  until: m.until,
  endedAt: m.ended_at,
});

export function arrangementView(m: ManagedRow, today: string): ArrangementView {
  return {
    id: m.id,
    sfUnitId: m.sf_unit_id,
    unitName: m.unit_name,
    project: m.project,
    providerId: m.provider_id,
    providerName: m.provider_name,
    source: m.source,
    since: m.since,
    until: m.until,
    endedAt: m.ended_at,
    current: isManagedOn(facts(m), today),
  };
}

/** The arrangement not yet ended on this unit (it may have passed its until date), or null. */
export function openArrangement(db: D1Database, sfUnitId: string): Promise<ManagedRow | null> {
  return db
    .prepare(`${MANAGED_SELECT} WHERE m.sf_unit_id = ? AND m.ended_at IS NULL`)
    .bind(sfUnitId)
    .first<ManagedRow>();
}

/** O4: the arrangement in force on this unit today, or null when the owner runs it. */
export async function managedNow(db: D1Database, sfUnitId: string, now: number): Promise<ManagedRow | null> {
  const m = await openArrangement(db, sfUnitId);
  return m !== null && isManagedOn(facts(m), dubaiDate(now)) ? m : null;
}

/**
 * The arrangement `id` if the signed-in office's company manages it (in force today unless `anyState`), else 404
 * (unknown and not-yours look alike, C-AZ-2).
 */
export async function officeArrangement(c: Ctx, id: string, anyState = false): Promise<ManagedRow> {
  const partnerId = c.get('auth').partnerId;
  const m = await c.env.DB.prepare(`${MANAGED_SELECT} WHERE m.id = ?`).bind(id).first<ManagedRow>();
  if (m === null || partnerId === null || m.provider_id !== partnerId) throw new ApiError(404, 'Not found.');
  if (!anyState && !isManagedOn(facts(m), dubaiDate(c.get('now')))) throw new ApiError(404, 'Not found.');
  return m;
}

/** A1 (ADR 0034): the manager's chosen maintenance company, when it can take work now; null = normal routing. */
export async function managerMaintenancePartner(
  db: D1Database,
  providerId: string,
): Promise<{ readonly id: string; readonly name: string } | null> {
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.status FROM manager_settings s JOIN partners p ON p.id = s.maintenance_partner_id
       WHERE s.provider_id = ?`,
    )
    .bind(providerId)
    .first<MaintenancePartnerFacts & { name: string }>();
  if (row === null) return null;
  return maintenancePartnerFor(row) === null ? null : { id: row.id, name: row.name };
}

type Detail = Readonly<Record<string, string | number | boolean | null>>;

/** The audit entry for a managed-unit change by the signed-in person (C-AUD-1). */
export function managedAudit(
  c: Ctx,
  action: AuditAction,
  targetType: string,
  targetId: string,
  detail?: Detail,
): D1PreparedStatement {
  const a = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: a.userId,
    actorRole: a.role,
    action,
    targetType,
    targetId,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
    ...(detail === undefined ? {} : { detail }),
  });
}

/** Statements that start an arrangement, ending the open one on the unit first (history kept). */
export function startArrangementStatements(
  c: Ctx,
  a: {
    readonly id: string;
    readonly sfUnitId: string;
    readonly ownerUserId: string;
    readonly providerId: string;
    readonly source: ManagedSource;
    readonly requestId: string | null;
    readonly since: string;
    readonly until: string | null;
  },
): D1PreparedStatement[] {
  const db = c.env.DB;
  const now = c.get('now');
  const actor = c.get('auth').userId;
  return [
    db
      .prepare(
        'UPDATE managed_units SET ended_at = ?, ended_by = ? WHERE sf_unit_id = ? AND ended_at IS NULL',
      )
      .bind(now, actor, a.sfUnitId),
    db
      .prepare(
        `INSERT INTO managed_units (id, sf_unit_id, owner_user_id, provider_id, source, request_id, since, until, set_at, set_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        a.id,
        a.sfUnitId,
        a.ownerUserId,
        a.providerId,
        a.source,
        a.requestId,
        a.since,
        a.until,
        now,
        actor,
      ),
  ];
}

/** The latest statement of each month for an arrangement, newest month first (a later upload corrects a month). */
export async function statementsOf(db: D1Database, managedUnitId: string): Promise<StatementView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, month, uploaded_at FROM managed_statements s WHERE managed_unit_id = ?1 AND s.rowid =
         (SELECT x.rowid FROM managed_statements x WHERE x.managed_unit_id = ?1 AND x.month = s.month
          ORDER BY x.uploaded_at DESC, x.rowid DESC LIMIT 1)
       ORDER BY month DESC`,
    )
    .bind(managedUnitId)
    .all<{ id: string; month: string; uploaded_at: number }>();
  return results.map((s) => ({ id: s.id, month: s.month, uploadedAt: s.uploaded_at }));
}
