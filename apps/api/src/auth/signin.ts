/**
 * Passwordless sign-in by a one-time code sent to an email or mobile number
 * (C-AUTH-1, C-AUTH-2, C-AUTH-3, C-SES-1; BUILD_SPEC T3).
 *
 * 1. Request a code: always the same answer whether or not the email/number belongs to someone, so the
 *    endpoint cannot be used to find out who is a JAD customer. People already in JAD+ get a code; anyone else
 *    gets one only if Salesforce says they are an owner (C-AUTH-3). The lookup and the delivery run in the
 *    background, so the answer takes the same time either way.
 * 2. Verify: the newest live code for that identity is checked in constant time; wrong guesses count against
 *    the code (5), the identity (lockout) and the network address. A right code is consumed exactly once.
 *    Salesforce is then asked again, so an owner who sold their unit loses owner access at once (U3); if
 *    Salesforce is down, people already in JAD+ still get in with what JAD+ knows (T2).
 */
import {
  SIGN_IN_CODE_MAX_FAILURES,
  SIGN_IN_CODE_TTL_MS,
  THROTTLE,
  contextsForClient,
  identifierOf,
  type RequestCodeBody,
  type SignInIdentifier,
  type VerifyCodeBody,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { ApiError } from '../errors.js';
import { auditStatement } from '../audit.js';
import { blindIndex, constantTimeEqual, newId, newSignInCode, toBytes } from '../crypto.js';
import type { Deps } from '../context.js';
import type { AppEnv } from '../env.js';
import { applyOwnerLookup } from '../owners/link.js';
import { newSession, revokeAllStatement, roleContexts } from './sessions.js';
import { countAttempt, isAllowed, resetStatement, throttleKey } from './throttle.js';

type Ctx = Context<AppEnv>;

export const CODE_SENT_MESSAGE =
  'If this email or number is registered with JAD Global, we have sent a 6-digit code. It expires in 10 minutes.';
const SALESFORCE_DOWN = 'We could not check your details right now. Please try again shortly.';
const ASK_THE_DESK = 'We could not match your details to one JAD Global owner. Please contact the JAD+ desk.';
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

function identityHash(c: Ctx, who: SignInIdentifier): Promise<Uint8Array> {
  return blindIndex(c.get('keys'), who.kind, who.value);
}

/** The JAD+ user with this email or number, whatever their status. */
function findUser(db: D1Database, who: SignInIdentifier, identity: Uint8Array) {
  const column = who.kind === 'email' ? 'email_hash' : 'phone_hash';
  return db
    .prepare(`SELECT id, status FROM users WHERE ${column} = ?`)
    .bind(identity)
    .first<{ id: string; status: 'active' | 'frozen' | 'closed' }>();
}

/** Stores a new code for this identity (replacing any older one) and returns it. */
async function issueCode(c: Ctx, identity: Uint8Array, userId: string | null): Promise<string> {
  const db = c.env.DB;
  const now = c.get('now');
  const codeId = newId();
  const code = newSignInCode();
  await db.batch([
    // A new code replaces any older live code for the same identity (marked used, never reusable).
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
      ...(userId === null ? { detail: { via: 'salesforce' } } : { targetType: 'user', targetId: userId }),
      ipHash: c.get('ipHash'),
      httpRequestId: c.get('requestId'),
    }),
  ]);
  return code;
}

/** Someone not yet in JAD+ gets a code only if Salesforce says they are an owner (C-AUTH-3). */
async function salesforceOwnerFor(c: Ctx, deps: Deps, who: SignInIdentifier): Promise<boolean> {
  const lookup = await deps.ownerDirectory(c.env, who);
  const known = lookup.found && !lookup.shared && lookup.person !== null && lookup.units.length > 0;
  if (!known)
    c.get('log').log('info', 'Sign-in code not sent: not a Salesforce owner', { shared: lookup.shared });
  return known;
}

export async function requestCode(c: Ctx, deps: Deps, body: RequestCodeBody): Promise<void> {
  const { DB: db } = c.env;
  const now = c.get('now');
  const who = identifierOf(body);
  const ipKey = throttleKey('ip:send', c.get('ipHash'));
  const identity = await identityHash(c, who);
  const idKey = throttleKey('id:send', identity);

  for (const key of [ipKey, idKey]) {
    const check = await isAllowed(db, key, now);
    if (!check.allowed) throw tooMany(check.retryAfterMs);
  }
  await countAttempt(db, ipKey, now, THROTTLE.sendPerIp);
  await countAttempt(db, idKey, now, THROTTLE.sendPerIdentity);

  const log = c.get('log');
  const user = await findUser(db, who, identity);
  const work = async (): Promise<void> => {
    // A closed account gets no code, even if Salesforce still lists the person as an owner.
    if (user?.status === 'closed') return;
    if (user === null && !(await salesforceOwnerFor(c, deps, who))) return;
    const code = await issueCode(c, identity, user?.id ?? null);
    await deps.sendSignInCode(c.env, who, code);
  };
  await inBackground(
    c,
    work().catch((err: unknown) => {
      log.log('error', 'Sign-in code was not sent', { err, channel: who.kind });
    }),
  );
}

export interface SignedIn {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly context: { readonly role: string; readonly partnerId: string | null };
  readonly contexts: readonly { readonly role: string; readonly partnerId: string | null }[];
}

interface CodeRow {
  id: string;
  code_hash: unknown;
  failed_attempts: number;
}

/**
 * After a right code: bring the person's owner access in line with Salesforce and return who they are.
 * Salesforce down: people already in JAD+ continue with what JAD+ knows (T2); new people must try later.
 */
async function reconcileOwner(
  c: Ctx,
  deps: Deps,
  who: SignInIdentifier,
  userId: string | null,
): Promise<string> {
  const log = c.get('log');
  let lookup;
  try {
    lookup = await deps.ownerDirectory(c.env, who);
  } catch (err) {
    log.log('warn', 'Salesforce lookup failed at sign-in', { err });
    if (userId === null) throw new ApiError(503, SALESFORCE_DOWN);
    return userId;
  }
  const result = await applyOwnerLookup(
    {
      db: c.env.DB,
      keys: c.get('keys'),
      now: c.get('now'),
      ipHash: c.get('ipHash'),
      requestId: c.get('requestId'),
    },
    lookup,
    userId,
    who,
  );
  if (result.kind === 'closed') throw new ApiError(403, ASK_THE_DESK);
  if (result.kind === 'conflict') {
    log.log('warn', 'Salesforce person matches more than one JAD+ user');
    throw new ApiError(409, ASK_THE_DESK);
  }
  if (result.userId === null) throw new ApiError(401, CODE_REJECTED_MESSAGE);
  return result.userId;
}

export async function verifyCode(c: Ctx, deps: Deps, body: VerifyCodeBody): Promise<SignedIn> {
  const { DB: db } = c.env;
  const now = c.get('now');
  const ipHash = c.get('ipHash');
  const who = identifierOf(body);
  const identity = await identityHash(c, who);
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

  const known = await findUser(db, who, identity);
  if (known?.status === 'closed') throw new ApiError(401, CODE_REJECTED_MESSAGE);
  const userId = await reconcileOwner(c, deps, who, known?.id ?? null);

  const contexts = contextsForClient(await roleContexts(db, userId), body.client);
  const [first] = contexts;
  if (first === undefined) {
    throw new ApiError(403, 'This account has no access here. Please talk to JAD+ Admin.');
  }
  const session = await newSession(db, { userId: userId, context: first, client: body.client, now, ipHash });
  await db.batch([
    // T3: signing in on a new phone ends the session on the old one.
    revokeAllStatement(db, userId, 'new_login', now, body.client),
    ...session.statements,
    resetStatement(db, idKey),
    auditStatement(db, {
      at: now,
      actorUserId: userId,
      actorRole: first.role,
      action: 'sign_in',
      targetType: 'session',
      targetId: session.sessionId,
      ipHash,
      httpRequestId: c.get('requestId'),
      detail: { client: body.client },
    }),
  ]);
  return {
    token: session.token,
    sessionId: session.sessionId,
    expiresAt: session.absoluteExpiresAt,
    context: first,
    contexts,
  };
}
