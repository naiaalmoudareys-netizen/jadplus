/** Fictional invoice fixtures (ADR 0026): finished jobs with what the owner approved, and the office's steps. */
import { inboxResponse, partnerInvoice } from '@jadplus/shared';
import { expect } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import type { World } from './emergency-world.js';

export const DAY = 86_400_000;
export const TRN = '100123456789003';
export const PAY = 'Bank transfer to IBAN AE07 0000 0000 0000 0000 000 (Primary Fixers LLC)';

export async function office(w: World, partner = 'p-primary', email = 'office@example.com'): Promise<string> {
  await w.h.addUser({ email, roles: [['partner_admin', partner]] });
  return w.h.signIn(email, 'console');
}

export const get = (w: World, path: string, token: string): Promise<Response> => w.h.request(path, { token });
export const post = (w: World, path: string, token: string, json: object = {}): Promise<Response> =>
  w.h.request(path, { method: 'POST', token, json });

/** A job of the primary partner for the owner's unit, raised by the tenant, with what the owner approved. */
export function job(
  w: World,
  id: string,
  o: {
    status?: string;
    closeReason?: string | null;
    quoteFils?: number;
    makeSafeFils?: number;
    partner?: string;
  } = {},
): string {
  const db = w.h.sqlite;
  const partner = o.partner ?? 'p-primary';
  db.prepare(
    `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
       raised_by_role, description, is_emergency, status, close_reason, partner_id, created_at, updated_at,
       status_changed_at)
     VALUES (?, ?, 'maintenance', ?, ?, 'ten-1', ?, 'tenant', 'Dripping tap.', 0, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `JAD-${id.toUpperCase()}`,
    SF_UNIT,
    w.owner,
    w.tenant,
    o.status ?? 'completed',
    o.closeReason ?? null,
    partner,
    NOW - 5 * DAY,
    NOW - DAY,
    NOW - DAY,
  );
  if ((o.quoteFils ?? 40_000) > 0) {
    db.prepare(
      `INSERT INTO quotes (id, request_id, partner_id, revision, amount_fils, scope, is_make_safe, status, sent_at,
         expires_at, decided_at, decided_by_user_id)
       VALUES (?, ?, ?, 1, ?, 'Replace the tap.', 0, 'approved', ?, ?, ?, ?)`,
    ).run(
      `q-${id}`,
      id,
      partner,
      o.quoteFils ?? 40_000,
      NOW - 4 * DAY,
      NOW + 10 * DAY,
      NOW - 3 * DAY,
      w.owner,
    );
  }
  if ((o.makeSafeFils ?? 0) > 0) {
    db.prepare(
      `INSERT INTO consents (id, user_id, kind, version, accepted, make_safe_cap_fils, at, ip_hash)
       VALUES (?, ?, 'make_safe_cap', 'v1', 1, 100000, ?, ?)`,
    ).run(`c-${id}`, w.owner, NOW - 30 * DAY, new Uint8Array(32));
    db.prepare(
      `INSERT INTO make_safe_works (id, request_id, partner_id, amount_fils, scope, consent_id, recorded_by_user_id, at)
       VALUES (?, ?, ?, ?, 'Water shut off.', ?, ?, ?)`,
    ).run(`m-${id}`, id, partner, o.makeSafeFils ?? 0, `c-${id}`, w.owner, NOW - 4 * DAY);
  }
  return id;
}

export async function issue(
  w: World,
  token: string,
  requestId: string,
  extra: object = {},
): Promise<Response> {
  return post(w, '/api/partner/invoices', token, { requestId, trn: TRN, paymentInstructions: PAY, ...extra });
}

export async function issued(w: World, token: string, requestId: string): Promise<string> {
  const res = await issue(w, token, requestId);
  expect(res.status).toBe(201);
  return partnerInvoice.parse(await res.json()).id;
}

/** Moves an invoice `days` back in time (sessions would expire if the test clock jumped weeks ahead). */
export function backdate(w: World, id: string, days: number): void {
  w.h.sqlite
    .prepare(
      `UPDATE invoices SET issue_date = date(issue_date, ?), due_date = date(due_date, ?), issued_at = issued_at - ?
       WHERE id = ?`,
    )
    .run(`-${String(days)} days`, `-${String(days)} days`, days * DAY, id);
}

export async function inboxKinds(w: World, token: string): Promise<string[]> {
  return inboxResponse.parse(await (await get(w, '/api/me/inbox', token)).json()).items.map((i) => i.kind);
}
