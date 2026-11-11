/**
 * Shared pieces of the JAD+ Admin operations routes (ADR 0025): the audit entry for a staff action, encrypted
 * staff text (notes and reasons, C-PD-2), decrypting a person's fields, and reading a request for a staff action.
 */
import { canTransition, type NOTE_KINDS, type Status } from '@jadplus/shared';
import type { Context } from 'hono';
import { z } from 'zod';
import { auditStatement, type AuditAction } from '../../audit.js';
import { decryptField, encryptField, newId, toBytes } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import type { FlowRow } from '../../requests/flow.js';

export type Ctx = Context<AppEnv>;

export const READ = ['jad_admin', 'jad_viewer'] as const;
export const NOT_FOUND = 'Not found.';
export const idParam = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

const detailSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

/** A stored JSON detail (audit entry, history event): flat facts only, anything else shown as null. */
export function parseDetail(raw: string | null): z.infer<typeof detailSchema> | null {
  if (raw === null) return null;
  try {
    const parsed = detailSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** One audit entry for what the signed-in staff member did (C-AUD-1). `detail` never holds personal data. */
export function staffAudit(
  c: Ctx,
  action: AuditAction,
  target: { readonly type: string; readonly id: string },
  detail?: Readonly<Record<string, string | number | boolean | null>>,
): D1PreparedStatement {
  const actor = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: actor.userId,
    actorRole: actor.role,
    action,
    targetType: target.type,
    targetId: target.id,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
    ...(detail === undefined ? {} : { detail }),
  });
}

/** Decrypts an optional personal-data column; `context` is "<table>.<column>:<row id>". */
export async function decrypted(c: Ctx, value: unknown, context: string): Promise<string | null> {
  return value === null || value === undefined ? null : decryptField(c.get('keys'), toBytes(value), context);
}

/** A person's name, email and mobile, decrypted. */
export async function personFields(
  c: Ctx,
  u: { id: string; name_enc: unknown; email_enc: unknown; phone_enc: unknown },
): Promise<{ name: string | null; email: string | null; phone: string | null }> {
  const [name, email, phone] = await Promise.all([
    decrypted(c, u.name_enc, `users.name:${u.id}`),
    decrypted(c, u.email_enc, `users.email:${u.id}`),
    decrypted(c, u.phone_enc, `users.phone:${u.id}`),
  ]);
  return { name, email, phone };
}

export type NoteKind = (typeof NOTE_KINDS)[number];

/** A staff note on a request, encrypted (staff text can name people). */
export async function noteStatement(
  c: Ctx,
  requestId: string,
  kind: NoteKind,
  text: string,
): Promise<{ id: string; statement: D1PreparedStatement }> {
  const id = newId();
  const statement = c.env.DB.prepare(
    'INSERT INTO request_notes (id, request_id, author_user_id, kind, body_enc, at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    id,
    requestId,
    c.get('auth').userId,
    kind,
    await encryptField(c.get('keys'), text, `request_notes.body:${id}`),
    c.get('now'),
  );
  return { id, statement };
}

export type ReasonAction = 'account_frozen' | 'account_unfrozen' | 'tenancy_ended' | 'staff_removed';

/** Why staff acted on a person or tenancy, encrypted. */
export async function reasonStatement(
  c: Ctx,
  target: { readonly type: 'user' | 'tenancy'; readonly id: string },
  action: ReasonAction,
  reason: string,
): Promise<D1PreparedStatement> {
  const id = newId();
  return c.env.DB.prepare(
    `INSERT INTO admin_reasons (id, target_type, target_id, action, reason_enc, by_user_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    target.type,
    target.id,
    action,
    await encryptField(c.get('keys'), reason, `admin_reasons.reason:${id}`),
    c.get('auth').userId,
    c.get('now'),
  );
}

export interface AdminRow extends FlowRow {
  service_code: string;
  emergency_type: string | null;
}

/** The request for a staff action; 404 if unknown, 409 if JAD+ Admin may not move it to `to` (lifecycle.ts). */
export async function requestForAction(c: Ctx, id: string, to: Status | null): Promise<AdminRow> {
  const row = await c.env.DB.prepare(
    `SELECT id, status, is_emergency, acknowledged_at, partner_id, owner_user_id, tenancy_id, raised_by_user_id,
            close_reason, next_due_at, next_due_kind, version, service_code, emergency_type
     FROM requests WHERE id = ?`,
  )
    .bind(id)
    .first<AdminRow>();
  if (row === null) throw new ApiError(404, NOT_FOUND);
  if (to !== null && !canTransition('jad_admin', row.status, to)) {
    throw new ApiError(409, 'This step is not possible for this request now. Refresh and try again.');
  }
  return row;
}

/** 404 unless the request exists. */
export async function requireRequest(c: Ctx, id: string): Promise<void> {
  const found = await c.env.DB.prepare('SELECT 1 AS yes FROM requests WHERE id = ?').bind(id).first();
  if (found === null) throw new ApiError(404, NOT_FOUND);
}

/** Statements calling off booked visits and withdrawing a pending quote (the job leaves this partner). */
export function callOffStatements(c: Ctx, requestId: string): D1PreparedStatement[] {
  const db = c.env.DB;
  return [
    db
      .prepare(
        "UPDATE visits SET status = 'cancelled' WHERE request_id = ? AND status IN ('booked', 'on_the_way')",
      )
      .bind(requestId),
    db
      .prepare(
        "UPDATE quotes SET status = 'withdrawn', decided_at = ? WHERE request_id = ? AND status = 'pending'",
      )
      .bind(c.get('now'), requestId),
  ];
}
