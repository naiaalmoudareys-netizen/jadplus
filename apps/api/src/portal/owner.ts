/** Shared by the owner routes: the owner's verified email, and their residence data (ADR 0010). */
import type { OwnerPortal } from '@jadplus/shared';
import type { Context } from 'hono';
import type { Deps } from '../context.js';
import { decryptField, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';

type Ctx = Context<AppEnv>;

export const UNAVAILABLE = 'We could not load your details right now. Please try again shortly.';

export async function ownerEmail(c: Ctx): Promise<string> {
  const { userId } = c.get('auth');
  const row = await c.env.DB.prepare('SELECT email_enc FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email_enc: unknown }>();
  if (row === null || row.email_enc === null) {
    throw new ApiError(409, 'Your email is not on file yet. Please contact the JAD+ desk.');
  }
  return decryptField(c.get('keys'), toBytes(row.email_enc), `users.email:${userId}`);
}

export async function loadPortal(c: Ctx, deps: Deps): Promise<OwnerPortal> {
  const email = await ownerEmail(c);
  try {
    return await deps.ownerPortal(c.env, email, c.get('now'));
  } catch (err) {
    c.get('log').log('warn', 'Owner data could not be loaded', { err });
    throw new ApiError(503, UNAVAILABLE);
  }
}
