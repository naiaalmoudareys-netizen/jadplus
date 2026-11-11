/**
 * Adding a provider company (ADR 0030; S3, S7, S10, P6, C-AZ-1, C-AUD-1). jad_admin only.
 *
 * - POST /api/admin/partners   { name, kind, adminName, adminEmail }: an outside partner ('external') or a JAD
 *                              Global team ('jad_group'), with the person who runs its office (partner_admin). That
 *                              person signs in to the partner office console with a one-time code, adds the team,
 *                              and uploads the trade licence and insurance.
 *
 * A new provider starts suspended ("not on file"), exactly as the daily check would leave it (suspended_by
 * 'compliance'), so it gets no jobs and cannot be chosen for a service until JAD+ verifies its documents; the
 * daily check then reinstates it. The audit entry holds the kind, never the person's name or email (C-PD-2).
 */
import { NEW_PROVIDER_REASON, addProviderBody, sameProviderName } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { blindIndex, encryptField, newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody } from '../../validate.js';
import { CHANGERS, audit } from './common.js';

export function platformProviderRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/partners', requireRole(...CHANGERS), async (c) => {
    const body = await parseJsonBody(c, addProviderBody);
    const db = c.env.DB;
    const keys = c.get('keys');
    const now = c.get('now');
    const { results: existing } = await db.prepare('SELECT name FROM partners').all<{ name: string }>();
    if (existing.some((p) => sameProviderName(p.name, body.name))) {
      throw new ApiError(409, 'A provider with this name already exists.');
    }
    const hash = await blindIndex(keys, 'email', body.adminEmail);
    const found = await db
      .prepare('SELECT id, status FROM users WHERE email_hash = ?')
      .bind(hash)
      .first<{ id: string; status: string }>();
    if (found !== null && found.status !== 'active') {
      throw new ApiError(409, 'This account is frozen or closed.');
    }
    const partnerId = newId();
    const userId = found?.id ?? newId();
    const createUser =
      found === null
        ? [
            db
              .prepare(
                `INSERT INTO users (id, email_hash, email_enc, name_enc, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                userId,
                hash,
                await encryptField(keys, body.adminEmail, `users.email:${userId}`),
                await encryptField(keys, body.adminName, `users.name:${userId}`),
                now,
                now,
              ),
          ]
        : [];
    await db.batch([
      db
        .prepare(
          `INSERT INTO partners (id, name, kind, status, status_reason, suspended_by, created_at, updated_at)
           VALUES (?, ?, ?, 'suspended', ?, 'compliance', ?, ?)`,
        )
        .bind(partnerId, body.name, body.kind, NEW_PROVIDER_REASON, now, now),
      ...createUser,
      db
        .prepare(
          `INSERT INTO user_roles (id, user_id, role, partner_id, granted_at, granted_by)
           VALUES (?, ?, 'partner_admin', ?, ?, ?)`,
        )
        .bind(newId(), userId, partnerId, now, c.get('auth').userId),
      audit(c, 'provider_added', 'partner', partnerId, { kind: body.kind, newPerson: found === null }),
    ]);
    return c.json({ id: partnerId, kind: body.kind, status: 'suspended' }, 201);
  });

  return r;
}
