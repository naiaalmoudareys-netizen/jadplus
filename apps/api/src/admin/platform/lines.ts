/**
 * Building help lines (E12; ADR 0029): the security desk and building management numbers residents may call.
 * - GET    /api/admin/building-lines?project=   the lines of a project and its buildings (JAD+ Admin and viewers)
 * - PUT    /api/admin/building-lines            set or change one line (kind) of a project or building
 * - DELETE /api/admin/building-lines/:id        remove a line (the row is deleted; the audit log keeps it)
 * The number is stored encrypted (C-PD-2) and never written to the log or to the audit detail (C-AUD-1).
 * These are service lines, not personal data, so reading them is not audited.
 */
import {
  buildingLineBody,
  platformIdParam,
  projectQuery,
  type AdminBuildingLines,
  type BuildingLineKind,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { decryptField, encryptField, newId, toBytes, type Keys } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody, parseParams, parseQuery } from '../../validate.js';
import { CHANGERS, READERS, audit, placeBuilding, requireKnownPlace, storedBuilding } from './common.js';

export interface LineRow {
  id: string;
  project: string;
  building: string;
  kind: BuildingLineKind;
  phone_enc: Uint8Array;
  hours: string | null;
  updated_at: number;
}

export const LINE_COLUMNS = 'id, project, building, kind, phone_enc, hours, updated_at';

const phoneContext = (id: string): string => `building_lines.phone:${id}`;

/** A stored line as the API shows it, with its number decrypted. */
export async function lineView(keys: Keys, row: LineRow): Promise<AdminBuildingLines['lines'][number]> {
  return {
    id: row.id,
    project: row.project,
    building: placeBuilding(row.building),
    kind: row.kind,
    phone: await decryptField(keys, toBytes(row.phone_enc), phoneContext(row.id)),
    hours: row.hours,
    updatedAt: row.updated_at,
  };
}

export function platformLineRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/building-lines', requireRole(...READERS), async (c) => {
    const { project } = parseQuery(c, projectQuery);
    const { results } = await c.env.DB.prepare(
      `SELECT ${LINE_COLUMNS} FROM building_lines WHERE project = ? ORDER BY building, kind`,
    )
      .bind(project)
      .all<LineRow>();
    const keys = c.get('keys');
    const lines = await Promise.all(results.map((row) => lineView(keys, row)));
    return c.json({ lines } satisfies AdminBuildingLines);
  });

  r.put('/building-lines', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, buildingLineBody);
    const db = c.env.DB;
    const now = c.get('now');
    await requireKnownPlace(db, body);
    const building = storedBuilding(body.building);
    const existing = await db
      .prepare('SELECT id FROM building_lines WHERE project = ? AND building = ? AND kind = ?')
      .bind(body.project, building, body.kind)
      .first<{ id: string }>();
    const id = existing?.id ?? newId();
    const phoneEnc = await encryptField(c.get('keys'), body.phone, phoneContext(id));
    await db.batch([
      db
        .prepare(
          `INSERT INTO building_lines (id, project, building, kind, phone_enc, hours, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (project, building, kind) DO UPDATE SET
             phone_enc = excluded.phone_enc, hours = excluded.hours, updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`,
        )
        .bind(id, body.project, building, body.kind, phoneEnc, body.hours, now, c.get('auth').userId),
      // The number itself is never in the audit detail (ADR 0029).
      audit(c, 'building_line_set', 'building_line', id, {
        project: body.project,
        building,
        kind: body.kind,
        hours: body.hours,
        changed: existing !== null,
      }),
    ]);
    return c.json({ id }, existing === null ? 201 : 200);
  });

  r.delete('/building-lines/:id', requireRole(...CHANGERS), async (c) => {
    const { id } = parseParams(c, platformIdParam);
    const db = c.env.DB;
    const found = await db
      .prepare('SELECT project, building, kind FROM building_lines WHERE id = ?')
      .bind(id)
      .first<{ project: string; building: string; kind: BuildingLineKind }>();
    if (found === null) throw new ApiError(404, 'Not found.');
    await db.batch([
      db.prepare('DELETE FROM building_lines WHERE id = ?').bind(id),
      audit(c, 'building_line_removed', 'building_line', id, {
        project: found.project,
        building: found.building,
        kind: found.kind,
      }),
    ]);
    return c.json({ id, removed: true });
  });

  return r;
}
