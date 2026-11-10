/**
 * Finding people (ADR 0025; C-PD-1, C-PD-2, C-AUD-1). jad_admin and jad_viewer.
 *
 * - GET /people?q=    by exact email or mobile (blind index: the address itself is never searched in clear) or
 *                     by unit name (owners of the unit and its tenants)
 * - GET /people/:id   roles, units, tenancies (both sides), requests, desk requests, consents, live sessions
 *
 * Staff seeing a person's details is itself audited ('person_viewed', the person as target, no personal data).
 */
import {
  adminPeopleQuery,
  peopleSearch,
  type DeskRequestType,
  type DeskStatus,
  type Status,
  type UserRole,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { blindIndex } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseParams, parseQuery } from '../../validate.js';
import { NOT_FOUND, READ, idParam, personFields, staffAudit, type Ctx } from './common.js';

interface UserRow {
  id: string;
  name_enc: unknown;
  email_enc: unknown;
  phone_enc: unknown;
  status: 'active' | 'frozen' | 'closed';
}

const USER_COLUMNS = 'u.id, u.name_enc, u.email_enc, u.phone_enc, u.status';
const MAX_RESULTS = 20;

async function findUsers(c: Ctx, q: string): Promise<UserRow[]> {
  const db = c.env.DB;
  const search = peopleSearch(q);
  if (search.kind !== 'unit') {
    const hash = await blindIndex(c.get('keys'), search.kind, search.value);
    const column = search.kind === 'email' ? 'email_hash' : 'phone_hash';
    const row = await db
      .prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.${column} = ?`)
      .bind(hash)
      .first<UserRow>();
    return row === null ? [] : [row];
  }
  const { results } = await db
    .prepare(
      `SELECT ${USER_COLUMNS} FROM users u WHERE u.id IN (
         SELECT ou.user_id FROM owner_units ou WHERE ou.unit_name = ?1 COLLATE NOCASE
         UNION
         SELECT t.tenant_user_id FROM tenancies t JOIN owner_units ou ON ou.sf_unit_id = t.sf_unit_id
           WHERE ou.unit_name = ?1 COLLATE NOCASE AND t.status IN ('invited', 'active'))
       LIMIT ${MAX_RESULTS}`,
    )
    .bind(search.value)
    .all<UserRow>();
  return results;
}

async function rolesOf(c: Ctx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const { results } = await c.env.DB.prepare(
    `SELECT user_id, role, partner_id FROM user_roles
     WHERE revoked_at IS NULL AND user_id IN (${ids.map(() => '?').join(', ')}) ORDER BY granted_at`,
  )
    .bind(...ids)
    .all<{ user_id: string; role: UserRole; partner_id: string | null }>();
  return results;
}

async function summaries(c: Ctx, users: readonly UserRow[]) {
  const roles = await rolesOf(
    c,
    users.map((u) => u.id),
  );
  return Promise.all(
    users.map(async (u) => ({
      id: u.id,
      ...(await personFields(c, u)),
      status: u.status,
      roles: roles.filter((g) => g.user_id === u.id).map((g) => ({ role: g.role, partnerId: g.partner_id })),
    })),
  );
}

function viewedStatements(c: Ctx, ids: readonly string[]): D1PreparedStatement[] {
  return ids.map((id) => staffAudit(c, 'person_viewed', { type: 'user', id }));
}

async function search(c: Ctx) {
  const { q } = parseQuery(c, adminPeopleQuery);
  const users = await findUsers(c, q);
  const people = await summaries(c, users);
  if (people.length > 0)
    await c.env.DB.batch(
      viewedStatements(
        c,
        people.map((p) => p.id),
      ),
    );
  return c.json({ people });
}

async function person(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const db = c.env.DB;
  const user = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`)
    .bind(id)
    .first<UserRow>();
  if (user === null) throw new ApiError(404, NOT_FOUND);
  const summary = (await summaries(c, [user]))[0];
  if (summary === undefined) throw new ApiError(404, NOT_FOUND);
  const [units, tenancies, requests, desk, consents, sessions] = await Promise.all([
    db
      .prepare('SELECT sf_unit_id, unit_name, project FROM owner_units WHERE user_id = ? ORDER BY unit_name')
      .bind(id)
      .all<{ sf_unit_id: string; unit_name: string; project: string | null }>(),
    db
      .prepare(
        `SELECT t.id, CASE WHEN t.owner_user_id = ?1 THEN 'owner' ELSE 'tenant' END AS side, t.sf_unit_id,
                (SELECT x.unit_name FROM owner_units x WHERE x.sf_unit_id = t.sf_unit_id
                   ORDER BY x.synced_at DESC LIMIT 1) AS unit_name,
                t.status, t.starts_on, t.ends_on
         FROM tenancies t WHERE t.owner_user_id = ?1 OR t.tenant_user_id = ?1 ORDER BY t.invited_at DESC LIMIT 50`,
      )
      .bind(id)
      .all<{
        id: string;
        side: 'owner' | 'tenant';
        sf_unit_id: string;
        unit_name: string | null;
        status: 'invited' | 'active' | 'ended' | 'revoked';
        starts_on: string;
        ends_on: string;
      }>(),
    db
      .prepare(
        `SELECT r.id, r.ref, r.status, r.is_emergency, r.created_at,
                (SELECT name FROM services WHERE code = r.service_code) AS service_name
         FROM requests r WHERE r.owner_user_id = ?1 OR r.raised_by_user_id = ?1
         ORDER BY r.created_at DESC LIMIT 50`,
      )
      .bind(id)
      .all<{
        id: string;
        ref: string;
        status: Status;
        is_emergency: number;
        created_at: number;
        service_name: string | null;
      }>(),
    db
      .prepare(
        'SELECT id, type, status, created_at FROM desk_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      )
      .bind(id)
      .all<{
        id: string;
        type: DeskRequestType;
        status: DeskStatus;
        created_at: number;
      }>(),
    db
      .prepare('SELECT kind, version, accepted, at FROM consents WHERE user_id = ? ORDER BY at DESC LIMIT 50')
      .bind(id)
      .all<{
        kind: 'terms' | 'make_safe_cap' | 'marketing';
        version: string;
        accepted: number;
        at: number;
      }>(),
    db
      .prepare(
        'SELECT count(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?',
      )
      .bind(id, c.get('now'), c.get('now'))
      .first<{ n: number }>(),
  ]);
  await c.env.DB.batch(viewedStatements(c, [id]));
  return c.json({
    ...summary,
    ownerUnits: units.results.map((u) => ({
      sfUnitId: u.sf_unit_id,
      unitName: u.unit_name,
      project: u.project,
    })),
    tenancies: tenancies.results.map((t) => ({
      id: t.id,
      side: t.side,
      sfUnitId: t.sf_unit_id,
      unitName: t.unit_name,
      status: t.status,
      startsOn: t.starts_on,
      endsOn: t.ends_on,
    })),
    requests: requests.results.map((r) => ({
      id: r.id,
      ref: r.ref,
      status: r.status,
      emergency: r.is_emergency === 1,
      serviceName: r.service_name,
      createdAt: r.created_at,
    })),
    deskRequests: desk.results.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      createdAt: d.created_at,
    })),
    consents: consents.results.map((k) => ({
      kind: k.kind,
      version: k.version,
      accepted: k.accepted === 1,
      at: k.at,
    })),
    activeSessions: sessions?.n ?? 0,
  });
}

export function peopleRoutes(r: Hono<AppEnv>): void {
  r.get('/people', requireRole(...READ), search);
  r.get('/people/:id', requireRole(...READ), person);
}
