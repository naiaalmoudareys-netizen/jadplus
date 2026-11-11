/**
 * The managing team's maintenance company (ADR 0034; A1): an outside partner its managed units' approved tenant
 * repairs go to. Set by the team's office or by JAD+ Admin; null = the normal maintenance routing. The choice must
 * be an active outside partner when it is made; if it is later suspended, requests take the normal routing
 * (managerMaintenancePartner checks again at every approval).
 */
import type { MaintenanceSetting } from '@jadplus/shared';
import type { Context } from 'hono';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedAudit } from './store.js';

type Ctx = Context<AppEnv>;

export async function maintenanceSetting(db: D1Database, providerId: string): Promise<MaintenanceSetting> {
  const [current, choices] = await Promise.all([
    db
      .prepare(
        `SELECT s.maintenance_partner_id AS id, p.name FROM manager_settings s
         LEFT JOIN partners p ON p.id = s.maintenance_partner_id WHERE s.provider_id = ?`,
      )
      .bind(providerId)
      .first<{ id: string | null; name: string | null }>(),
    db
      .prepare("SELECT id, name FROM partners WHERE kind = 'external' AND status = 'active' ORDER BY name")
      .all<{ id: string; name: string }>(),
  ]);
  return {
    partnerId: current?.id ?? null,
    partnerName: current?.name ?? null,
    choices: choices.results,
  };
}

/** Save the choice (audited in the same batch). 400 when the partner is not an active outside partner. */
export async function saveMaintenanceSetting(
  c: Ctx,
  providerId: string,
  partnerId: string | null,
): Promise<void> {
  const db = c.env.DB;
  if (partnerId !== null) {
    const ok = await db
      .prepare("SELECT 1 AS yes FROM partners WHERE id = ? AND kind = 'external' AND status = 'active'")
      .bind(partnerId)
      .first();
    if (ok === null) throw new ApiError(400, 'Choose an active outside maintenance partner.');
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO manager_settings (provider_id, maintenance_partner_id, updated_at, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT (provider_id) DO UPDATE SET maintenance_partner_id = excluded.maintenance_partner_id,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(providerId, partnerId, c.get('now'), c.get('auth').userId),
    managedAudit(c, 'manager_settings_changed', 'partner', providerId, {
      maintenancePartner: partnerId,
    }),
  ]);
}
