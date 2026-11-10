/**
 * Sessions (C-SES-1) and role contexts (C-AZ-1, R5, U7). The client holds a random 256-bit token; the
 * database holds only its SHA-256. A session is bound to one role context; changing it issues a new token.
 */
import {
  newSessionTimes,
  sessionStatus,
  touchedIdleExpiry,
  SESSION_TOUCH_INTERVAL_MS,
  type Client,
  type RoleContext,
  type UserRole,
} from '@jadplus/shared';
import { newId, newToken, sha256 } from '../crypto.js';
import type { Auth } from '../env.js';

export type RevokeReason =
  'sign_out' | 'sign_out_everywhere' | 'rotated' | 'new_login' | 'role_revoked' | 'account_frozen' | 'admin';

/** The live role grants a person holds. */
export async function roleContexts(db: D1Database, userId: string): Promise<RoleContext[]> {
  const { results } = await db
    .prepare('SELECT role, partner_id FROM user_roles WHERE user_id = ? AND revoked_at IS NULL')
    .bind(userId)
    .all<{ role: UserRole; partner_id: string | null }>();
  return results.map((r) => ({ role: r.role, partnerId: r.partner_id }));
}

export interface NewSession {
  readonly token: string;
  readonly sessionId: string;
  readonly absoluteExpiresAt: number;
  readonly statements: D1PreparedStatement[];
}

/** Builds (but does not run) the statements creating a session, so they join the caller's batch. */
export async function newSession(
  db: D1Database,
  opts: { userId: string; context: RoleContext; client: Client; now: number; ipHash: Uint8Array },
): Promise<NewSession> {
  const token = newToken();
  const sessionId = newId();
  const times = newSessionTimes(opts.client, opts.now);
  const insert = db
    .prepare(
      `INSERT INTO sessions (id, token_hash, user_id, role, partner_id, client, created_at, last_seen_at,
         idle_expires_at, absolute_expires_at, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      await sha256(token),
      opts.userId,
      opts.context.role,
      opts.context.partnerId,
      opts.client,
      opts.now,
      opts.now,
      times.idleExpiresAt,
      times.absoluteExpiresAt,
      opts.ipHash,
    );
  return { token, sessionId, absoluteExpiresAt: times.absoluteExpiresAt, statements: [insert] };
}

export function revokeSessionStatement(
  db: D1Database,
  sessionId: string,
  reason: RevokeReason,
  now: number,
): D1PreparedStatement {
  return db
    .prepare('UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(now, reason, sessionId);
}

/** Revokes every live session of a person, optionally only on one client (T3: new login ends the old one). */
export function revokeAllStatement(
  db: D1Database,
  userId: string,
  reason: RevokeReason,
  now: number,
  client?: Client,
): D1PreparedStatement {
  const sql = `UPDATE sessions SET revoked_at = ?, revoked_reason = ?
    WHERE user_id = ? AND revoked_at IS NULL${client === undefined ? '' : ' AND client = ?'}`;
  const params = client === undefined ? [now, reason, userId] : [now, reason, userId, client];
  return db.prepare(sql).bind(...params);
}

interface SessionRow {
  id: string;
  user_id: string;
  role: UserRole;
  partner_id: string | null;
  client: Client;
  last_seen_at: number;
  idle_expires_at: number;
  absolute_expires_at: number;
  revoked_at: number | null;
  user_status: 'active' | 'frozen' | 'closed';
  grant_live: number;
}

/**
 * Resolves a bearer token to the signed-in person, or null. A session also dies when the person's account
 * is closed or the role it is bound to has been revoked (rotated on privilege change).
 */
export async function resolveSession(db: D1Database, token: string, now: number): Promise<Auth | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.user_id, s.role, s.partner_id, s.client, s.last_seen_at, s.idle_expires_at,
              s.absolute_expires_at, s.revoked_at, u.status AS user_status,
              EXISTS (SELECT 1 FROM user_roles g WHERE g.user_id = s.user_id AND g.role = s.role
                      AND COALESCE(g.partner_id, '') = COALESCE(s.partner_id, '') AND g.revoked_at IS NULL) AS grant_live
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(await sha256(token))
    .first<SessionRow>();
  if (row === null) return null;
  const status = sessionStatus(
    {
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at,
    },
    now,
  );
  if (status !== 'valid') return null;
  if (row.user_status === 'closed' || row.grant_live !== 1) {
    await revokeSessionStatement(
      db,
      row.id,
      row.user_status === 'closed' ? 'admin' : 'role_revoked',
      now,
    ).run();
    return null;
  }
  if (now - row.last_seen_at >= SESSION_TOUCH_INTERVAL_MS) {
    await db
      .prepare('UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?')
      .bind(now, touchedIdleExpiry(row.client, row.absolute_expires_at, now), row.id)
      .run();
  }
  return {
    sessionId: row.id,
    userId: row.user_id,
    role: row.role,
    partnerId: row.partner_id,
    client: row.client,
    userStatus: row.user_status,
  };
}
