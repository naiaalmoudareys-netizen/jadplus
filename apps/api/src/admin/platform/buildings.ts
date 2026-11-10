/**
 * Buildings and their building management contacts (E12, V1; ADR 0025).
 * - GET    /api/admin/buildings                     projects and buildings with units, open requests, contacts
 * - GET    /api/admin/building-contacts?project=    the contacts of one project (audited: personal data)
 * - POST   /api/admin/building-contacts             add a contact (at most BUILDING_CONTACTS_MAX per place)
 * - DELETE /api/admin/building-contacts/:id         remove a contact (the row is deleted; the audit log keeps it)
 * Names, phones and emails are stored encrypted (C-PD-2) and never written to the log or audit detail.
 */
import {
  BUILDING_CONTACTS_MAX,
  OPEN_STATUSES,
  buildingContactBody,
  buildingKey,
  platformIdParam,
  projectQuery,
  type AdminBuildings,
  type BuildingContacts,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { decryptField, encryptField, newId, toBytes, type Keys } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { parseJsonBody, parseParams, parseQuery } from '../../validate.js';
import { CHANGERS, READERS, audit, placeBuilding, requireKnownPlace, storedBuilding } from './common.js';

interface ContactRow {
  id: string;
  project: string;
  building: string;
  name_enc: Uint8Array;
  role: string | null;
  phone_enc: Uint8Array | null;
  email_enc: Uint8Array | null;
  created_at: number;
}

const reveal = (keys: Keys, id: string, column: string, value: Uint8Array | null) =>
  value === null
    ? Promise.resolve(null)
    : decryptField(keys, toBytes(value), `building_contacts.${column}:${id}`);

type Counts = Map<string, number>;

function countBy(rows: readonly { project: string; building: string | null; n: number }[]): Counts {
  return new Map(rows.map((r) => [buildingKey({ project: r.project, building: r.building }), r.n]));
}

export function platformBuildingRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/buildings', requireRole(...READERS), async (c) => {
    const db = c.env.DB;
    const now = c.get('now');
    const statuses = [...OPEN_STATUSES];
    const [units, requests, contacts, notices] = await Promise.all([
      db
        .prepare(
          `SELECT project, building, COUNT(DISTINCT sf_unit_id) AS n FROM owner_units
           WHERE project IS NOT NULL GROUP BY project, building ORDER BY project, building`,
        )
        .all<{ project: string; building: string | null; n: number }>(),
      db
        .prepare(
          `SELECT ou.project AS project, ou.building AS building, COUNT(*) AS n FROM requests r ${LOCATION_JOIN}
           WHERE ou.project IS NOT NULL AND r.status IN (${statuses.map(() => '?').join(', ')})
           GROUP BY ou.project, ou.building`,
        )
        .bind(...statuses)
        .all<{ project: string; building: string | null; n: number }>(),
      db
        .prepare('SELECT project, building, COUNT(*) AS n FROM building_contacts GROUP BY project, building')
        .all<{ project: string; building: string; n: number }>(),
      db
        .prepare(
          `SELECT project, building FROM building_notices
           WHERE withdrawn_at IS NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)`,
        )
        .bind(now, now)
        .all<{ project: string; building: string }>(),
    ]);
    const openRequests = countBy(requests.results);
    const people = countBy(contacts.results.map((x) => ({ ...x, building: placeBuilding(x.building) })));
    const buildings: AdminBuildings['buildings'] = units.results.map((u) => {
      const place = { project: u.project, building: u.building };
      return {
        ...place,
        units: u.n,
        openRequests: openRequests.get(buildingKey(place)) ?? 0,
        contacts: people.get(buildingKey(place)) ?? 0,
        // A project-wide notice counts for every building of the project.
        currentNotices: notices.results.filter(
          (n) => n.project === u.project && (n.building === '' || n.building === u.building),
        ).length,
      };
    });
    return c.json({ buildings });
  });

  r.get('/building-contacts', requireRole(...READERS), async (c) => {
    const { project } = parseQuery(c, projectQuery);
    const db = c.env.DB;
    const keys = c.get('keys');
    const { results } = await db
      .prepare(
        `SELECT id, project, building, name_enc, role, phone_enc, email_enc, created_at FROM building_contacts
         WHERE project = ? ORDER BY building, created_at`,
      )
      .bind(project)
      .all<ContactRow>();
    const contacts: BuildingContacts['contacts'] = await Promise.all(
      results.map(async (row) => ({
        id: row.id,
        project: row.project,
        building: placeBuilding(row.building),
        name: await decryptField(keys, toBytes(row.name_enc), `building_contacts.name:${row.id}`),
        role: row.role,
        phone: await reveal(keys, row.id, 'phone', row.phone_enc),
        email: await reveal(keys, row.id, 'email', row.email_enc),
        createdAt: row.created_at,
      })),
    );
    // ADR 0025: viewing personal data in the console is audited.
    await audit(c, 'building_contacts_viewed', 'project', project.slice(0, 64), {
      count: contacts.length,
    }).run();
    return c.json({ contacts });
  });

  r.post('/building-contacts', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, buildingContactBody);
    const db = c.env.DB;
    const keys = c.get('keys');
    const now = c.get('now');
    await requireKnownPlace(db, body);
    const building = storedBuilding(body.building);
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM building_contacts WHERE project = ? AND building = ?')
      .bind(body.project, building)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= BUILDING_CONTACTS_MAX) {
      throw new ApiError(422, `A building has at most ${BUILDING_CONTACTS_MAX} contacts.`);
    }
    const id = newId();
    const enc = (column: string, value: string) =>
      encryptField(keys, value, `building_contacts.${column}:${id}`);
    await db.batch([
      db
        .prepare(
          `INSERT INTO building_contacts (id, project, building, name_enc, role, phone_enc, email_enc, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          body.project,
          building,
          await enc('name', body.name),
          body.role,
          body.phone === null ? null : await enc('phone', body.phone),
          body.email === null ? null : await enc('email', body.email),
          now,
          c.get('auth').userId,
        ),
      audit(c, 'building_contact_added', 'building_contact', id, { project: body.project, building }),
    ]);
    return c.json({ id }, 201);
  });

  r.delete('/building-contacts/:id', requireRole(...CHANGERS), async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const found = await db.prepare('SELECT id FROM building_contacts WHERE id = ?').bind(id).first();
    if (found === null) throw new ApiError(404, 'Not found.');
    await db.batch([
      db.prepare('DELETE FROM building_contacts WHERE id = ?').bind(id),
      audit(c, 'building_contact_removed', 'building_contact', id),
    ]);
    return c.json({ id, removed: true });
  });

  return r;
}
