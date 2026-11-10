/** Helpers shared by the JAD+ Admin platform routes (ADR 0025). */
import type { Place } from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement, type AuditAction } from '../../audit.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';

/** Admin reading: JAD+ Admin and JAD+ viewers. Changing: JAD+ Admin only. */
export const READERS = ['jad_admin', 'jad_viewer'] as const;
export const CHANGERS = ['jad_admin'] as const;

/** Places are stored with building '' for "the whole project" (migration 0020). */
export const storedBuilding = (building: string | null): string => building ?? '';
export const placeBuilding = (stored: string): string | null => (stored === '' ? null : stored);

/** The audit entry for a platform change or audited read, to put in the same batch (C-AUD-1). */
export function audit(
  c: Context<AppEnv>,
  action: AuditAction,
  targetType: string,
  targetId: string,
  detail?: Readonly<Record<string, string | number | boolean | null>>,
): D1PreparedStatement {
  const actor = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: actor.userId,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
    ...(detail === undefined ? {} : { detail }),
  });
}

/**
 * Notices, guides and contacts attach only to places JAD+ knows: a project (and building) on an owner's unit,
 * as Salesforce names them. Stops typos creating notices nobody sees.
 */
export async function requireKnownPlace(db: D1Database, place: Place): Promise<void> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM owner_units WHERE project = ? AND (? IS NULL OR building = ?) LIMIT 1`)
    .bind(place.project, place.building, place.building)
    .first<{ ok: number }>();
  if (row === null) throw new ApiError(422, 'No JAD+ unit is in that project or building.');
}
