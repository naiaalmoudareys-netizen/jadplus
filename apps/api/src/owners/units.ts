/**
 * Does this owner own this unit? (C-AZ-2, U3, T2). Answered from JAD+'s own copy of the owner's units. A copy
 * older than a day is refreshed from Salesforce first; if Salesforce is down the copy is used as is, so an
 * owner can always raise an emergency (T2).
 */
import { ownerUnitsFresh, type SignInIdentifier } from '@jadplus/shared';
import type { Context } from 'hono';
import type { Deps } from '../context.js';
import { decryptField, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { applyOwnerLookup } from './link.js';

type Ctx = Context<AppEnv>;

interface OwnerRow {
  owner_synced_at: number | null;
  email_enc: unknown;
  phone_enc: unknown;
}

async function identifierOfUser(c: Ctx, userId: string, row: OwnerRow): Promise<SignInIdentifier | null> {
  const keys = c.get('keys');
  if (row.email_enc !== null) {
    return {
      kind: 'email',
      value: await decryptField(keys, toBytes(row.email_enc), `users.email:${userId}`),
    };
  }
  if (row.phone_enc !== null) {
    return {
      kind: 'phone',
      value: await decryptField(keys, toBytes(row.phone_enc), `users.phone:${userId}`),
    };
  }
  return null;
}

async function refresh(c: Ctx, deps: Deps, userId: string, row: OwnerRow): Promise<void> {
  const who = await identifierOfUser(c, userId, row);
  if (who === null) return;
  const result = await applyOwnerLookup(
    {
      db: c.env.DB,
      keys: c.get('keys'),
      now: c.get('now'),
      ipHash: c.get('ipHash'),
      requestId: c.get('requestId'),
    },
    await deps.ownerDirectory(c.env, who),
    userId,
    null,
  );
  if (result.kind !== 'linked' && result.kind !== 'not_owner') {
    c.get('log').log('warn', 'Owner units not refreshed: needs the JAD+ desk', { outcome: result.kind });
  }
}

export async function ownsUnit(c: Ctx, deps: Deps, userId: string, sfUnitId: string): Promise<boolean> {
  const db = c.env.DB;
  const row = await db
    .prepare('SELECT owner_synced_at, email_enc, phone_enc FROM users WHERE id = ?')
    .bind(userId)
    .first<OwnerRow>();
  if (row === null) return false;
  if (row.owner_synced_at === null || !ownerUnitsFresh(row.owner_synced_at, c.get('now'))) {
    try {
      await refresh(c, deps, userId, row);
    } catch (err) {
      c.get('log').log('warn', 'Salesforce unreachable; using stored owner units', { err });
    }
  }
  const hit = await db
    .prepare('SELECT 1 AS yes FROM owner_units WHERE user_id = ? AND sf_unit_id = ?')
    .bind(userId, sfUnitId)
    .first();
  return hit !== null;
}
