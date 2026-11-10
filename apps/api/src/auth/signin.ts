/**
 * Passwordless sign-in by email code (C-AUTH-1, C-AUTH-2, C-SES-1; BUILD_SPEC T3).
 *
 * 1. Request a code: always the same answer whether or not the email belongs to someone, so the endpoint
 *    cannot be used to find out who has an account. The email is sent in the background.
 * 2. Verify: the newest live code for that email is checked in constant time; wrong guesses count against
 *    the code (5), the email (lockout) and the network address. A right code is consumed exactly once.
 */
import {
  SIGN_IN_CODE_MAX_FAILURES,
  SIGN_IN_CODE_TTL_MS,
  THROTTLE,
  contextsForClient,
  type RequestCodeBody,
  type VerifyCodeBody,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { ApiError } from '../errors.js';
import { auditStatement } from '../audit.js';
import { blindIndex, constantTimeEqual, newId, newSignInCode, toBytes } from '../crypto.js';
import type { Deps } from '../context.js';
import type { AppEnv } from '../env.js';
import { newSession, revokeAllStatement, roleContexts } from './sessions.js';
import { countAttempt, isAllowed, resetStatement, throttleKey } from './throttle.js';

type Ctx = Context<AppEnv>;

export const CODE_SENT_MESSAGE =
  'If this email is registered, we have sent a 6-digit code. It expires in 10 minutes.';
export const CODE_REJECTED_MESSAGE = 'That code is not valid or has expired. Request a new code.';
const TOO_MANY = 'Too many attempts. Please wait and try again.';

function tooMany(retryAfterMs: number): ApiError {
  return new ApiError(429, TOO_MANY, { headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) } });
}

/** Runs work after the response when the platform allows it (Workers), otherwise before it (tests). */
async function inBackground(c: Ctx, work: Promise<void>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | null = null;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = null;
  }
  if (ctx === null) await work;
  else ctx.waitUntil(work);
}

/** A code hash is bound to the code row, so one code's hash cannot be replayed for another row. */
function codeHash(c: Ctx, codeId: string, code: string): Promise<Uint8Array> {
  return blindIndex(c.get('keys'), 'sign_in_code', `${codeId}:${code}`);
}

export async function requestCode(c: Ctx, deps: Deps, body: RequestCodeBody): Promise<void> {
  const { DB: db } = c.env;
  const now = c.get('now');
  const ipKey = throttleKey('ip:send', c.get('ipHash'));
  const identity = await blindIndex(c.get('keys'), 'email', body.email);
  const idKey = throttleKey('id:send', identity);

  for (const key of [ipKey, idKey]) {
    const check = await isAllowed(db, key, now);
    if (!check.allowed) throw tooMany(check.retryAfterMs);
  }
  await countAttempt(db, ipKey, now, THROTTLE.sendPerIp);
  await countAttempt(db, idKey, now, THROTTLE.sendPerIdentity);

  const user = await db
    .prepare("SELECT id FROM users WHERE email_hash = ? AND status IN ('active', 'frozen')")
    .bind(identity)
    .first<{ id: string }>();
  if (user === null) return;

  const codeId = newId();
  const code = newSignInCode();
  await db.batch([
    // A new code replaces any older live code for the same email (marked used, never reusable).
    db
      .prepare('UPDATE sign_in_codes SET consumed_at = ? WHERE identity_hash = ? AND consumed_at IS NULL')
      .bind(now, identity),
    db
      .prepare(
        `INSERT INTO sign_in_codes (id, identity_hash, code_hash, created_at, expires_at, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        codeId,
        identity,
        await codeHash(c, codeId, code),
        now,
        now + SIGN_IN_CODE_TTL_MS,
        c.get('ipHash'),
      ),
    auditStatement(db, {
      at: now,
      actorUserId: null,
      actorRole: 'anonymous',
      action: 'sign_in_code_sent',
      targetType: 'user',
      targetId: user.id,
      ipHash: c.get('ipHash'),
      httpRequestId: c.get('requestId'),
    }),
  ]);
  const log = c.get('log');
  await inBackground(
    c,
    deps.sendSignInCode(c.env, body.email, code).catch((err: unknown) => {
      log.log('error', 'Sign-in code delivery failed', { err });
    }),
  );
}

export interface SignedIn {
  readonly token: string;
  readonly expiresAt: number;
  readonly context: { readonly role: string; readonly partnerId: string | null };
  readonly contexts: readonly { readonly role: string; readonly partnerId: string | null }[];
}

interface CodeRow {
  id: string;
  code_hash: unknown;
  failed_attempts: number;
}

export async function verifyCode(c: Ctx, body: VerifyCodeBody): Promise<SignedIn> {
  const { DB: db } = c.env;
  const now = c.get('now');
  const ipHash = c.get('ipHash');
  const identity = await blindIndex(c.get('keys'), 'email', body.email);
  const ipKey = throttleKey('ip:verify', ipHash);
  const idKey = throttleKey('id:verify', identity);

  for (const key of [ipKey, idKey]) {
    const check = await isAllowed(db, key, now);
    if (!check.allowed) throw tooMany(check.retryAfterMs);
  }
  await countAttempt(db, ipKey, now, THROTTLE.verifyPerIp);

  const row = await db
    .prepare(
      `SELECT id, code_hash, failed_attempts FROM sign_in_codes
       WHERE identity_hash = ? AND consumed_at IS NULL AND expires_at > ? AND failed_attempts < ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(identity, now, SIGN_IN_CODE_MAX_FAILURES)
    .first<CodeRow>();

  const matches =
    row !== null && constantTimeEqual(toBytes(row.code_hash), await codeHash(c, row.id, body.code));
  if (row === null || !matches) {
    if (row !== null) {
      await db
        .prepare('UPDATE sign_in_codes SET failed_attempts = failed_attempts + 1 WHERE id = ?')
        .bind(row.id)
        .run();
    }
    const lockedNow = await countAttempt(db, idKey, now, THROTTLE.verifyFailuresPerIdentity);
    await auditStatement(db, {
      at: now,
      actorUserId: null,
      actorRole: 'anonymous',
      action: lockedNow ? 'sign_in_locked_out' : 'sign_in_code_rejected',
      ipHash,
      httpRequestId: c.get('requestId'),
    }).run();
    throw new ApiError(401, CODE_REJECTED_MESSAGE);
  }

  // Consume the code; if another request consumed it first, this one fails (single use).
  const consumed = await db
    .prepare('UPDATE sign_in_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
    .bind(now, row.id)
    .run();
  if (consumed.meta.changes !== 1) throw new ApiError(401, CODE_REJECTED_MESSAGE);

  const user = await db
    .prepare("SELECT id FROM users WHERE email_hash = ? AND status IN ('active', 'frozen')")
    .bind(identity)
    .first<{ id: string }>();
  if (user === null) throw new ApiError(401, CODE_REJECTED_MESSAGE);

  const contexts = contextsForClient(await roleContexts(db, user.id), body.client);
  const [first] = contexts;
  if (first === undefined) {
    throw new ApiError(403, 'This account has no access here. Please talk to JAD+ Admin.');
  }
  const session = await newSession(db, { userId: user.id, context: first, client: body.client, now, ipHash });
  await db.batch([
    // T3: signing in on a new phone ends the session on the old one.
    revokeAllStatement(db, user.id, 'new_login', now, body.client),
    ...session.statements,
    resetStatement(db, idKey),
    auditStatement(db, {
      at: now,
      actorUserId: user.id,
      actorRole: first.role,
      action: 'sign_in',
      targetType: 'session',
      targetId: session.sessionId,
      ipHash,
      httpRequestId: c.get('requestId'),
      detail: { client: body.client },
    }),
  ]);
  return { token: session.token, expiresAt: session.absoluteExpiresAt, context: first, contexts };
}
