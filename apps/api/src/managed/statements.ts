/**
 * Monthly statements of managed units, and the owner's view of their managed units (ADR 0034; O4, C-AZ-2,
 * C-UPL-1, C-PD-3, C-AUD-1).
 *
 * - POST /api/partner/managed-units/:id/statements?month=YYYY-MM   the managing team's office uploads the month's
 *        PDF (raw body, 20 MB at most, "%PDF-" sniffed, private R2, size and SHA-256 kept, the client's file name
 *        never stored). A later upload for the same month corrects it; the old one stays as evidence.
 * - GET  /api/managed-units/:id/statements/:statementId/file      the PDF after the access check; every download
 *        is written to the audit log
 * - GET  /api/owner/managed-units                                  the owner's managed units (current and past)
 *        with their statements, for My unit
 *
 * Who reads a statement: the unit's owner on the arrangement (or a joint buyer on the same deal) while they own
 * the unit, the managing team's office, and JAD+ staff. Tenants never. Anyone else gets 404.
 */
import {
  STATEMENT_MAX_BYTES,
  dubaiDate,
  isPdf,
  managedIdParam,
  managedStatementParam,
  statementMonthAllowed,
  statementUploadQuery,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { workspacePage } from '../partner/workspace.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { statementReadyStatement } from '../requests/inbox-flows.js';
import { parseParams, parseQuery } from '../validate.js';
import {
  MANAGED_SELECT,
  arrangementView,
  facts,
  managedAudit,
  officeArrangement,
  statementsOf,
  type ManagedRow,
} from './store.js';

type Ctx = Context<AppEnv>;

/** Matches the upload route, which gets a 20 MB body limit instead of the API's 64 KB (app.ts). */
export const STATEMENT_UPLOAD_PATH = /^\/api\/partner\/managed-units\/[A-Za-z0-9_-]{1,64}\/statements$/;

/**
 * SQL: the person bound as ?1 owns the arrangement's unit now and is its owner or a joint buyer on the same deal
 * (owner_units is Salesforce's list, refreshed at sign-in; a unit that was sold drops out, U3).
 */
const OWNER_SEES = `EXISTS (SELECT 1 FROM owner_units me WHERE me.user_id = ?1 AND me.sf_unit_id = m.sf_unit_id
  AND (me.user_id = m.owner_user_id OR me.sf_deal_id IN
    (SELECT o.sf_deal_id FROM owner_units o WHERE o.user_id = m.owner_user_id AND o.sf_unit_id = m.sf_unit_id)))`;

async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** The arrangement if the signed-in person may read its statements, else 404 (C-AZ-2). */
async function readableArrangement(c: Ctx, id: string): Promise<ManagedRow> {
  const { role, userId, partnerId } = c.get('auth');
  const db = c.env.DB;
  if (role === 'owner') {
    const m = await db
      .prepare(`${MANAGED_SELECT} WHERE m.id = ?2 AND ${OWNER_SEES}`)
      .bind(userId, id)
      .first<ManagedRow>();
    if (m === null) throw new ApiError(404, 'Not found.');
    return m;
  }
  const m = await db.prepare(`${MANAGED_SELECT} WHERE m.id = ?`).bind(id).first<ManagedRow>();
  const staff = role === 'jad_admin' || role === 'jad_viewer';
  if (m === null || (!staff && (partnerId === null || m.provider_id !== partnerId))) {
    throw new ApiError(404, 'Not found.');
  }
  return m;
}

export function managedStatementRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post(
    '/partner/managed-units/:id/statements',
    requireRole('partner_admin'),
    workspacePage('managed_units'),
    async (c) => {
      const { id } = parseParams(c, managedIdParam);
      const { month } = parseQuery(c, statementUploadQuery);
      // Ended or past arrangements are refused by statementMonthAllowed; the office must be the managing team.
      const m = await officeArrangement(c, id, true);
      if (!statementMonthAllowed(month, facts(m), dubaiDate(c.get('now')))) {
        throw new ApiError(400, 'Choose a month of the management period, up to this month.');
      }
      const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.length === 0 || bytes.length > STATEMENT_MAX_BYTES)
        throw new ApiError(413, 'Statements can be up to 20 MB.');
      if (declared !== 'application/pdf' || !isPdf(bytes)) throw new ApiError(415, 'Please upload a PDF.');
      const db = c.env.DB;
      const statementId = newId();
      const key = `managed/${m.id}/statements/${statementId}.pdf`;
      await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
      await db.batch([
        db
          .prepare(
            `INSERT INTO managed_statements (id, managed_unit_id, month, r2_key, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            statementId,
            m.id,
            month,
            key,
            bytes.length,
            await digest(bytes),
            c.get('auth').userId,
            c.get('now'),
          ),
        managedAudit(c, 'managed_statement_uploaded', 'managed_unit', m.id, { month, bytes: bytes.length }),
        // The owner is told once per month (a corrected upload for the same month is not announced again).
        m.request_id === null
          ? statementReadyStatement(db, { userId: m.owner_user_id, period: month, at: c.get('now') })
          : statementReadyStatement(db, { requestId: m.request_id, period: month, at: c.get('now') }),
      ]);
      return c.json({ id: statementId, month }, 201);
    },
  );

  r.get(
    '/managed-units/:id/statements/:statementId/file',
    requireRole('owner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id, statementId } = parseParams(c, managedStatementParam);
      const m = await readableArrangement(c, id);
      const s = await c.env.DB.prepare(
        'SELECT month, r2_key FROM managed_statements WHERE id = ? AND managed_unit_id = ?',
      )
        .bind(statementId, m.id)
        .first<{ month: string; r2_key: string }>();
      const object = s === null ? null : await c.env.MEDIA.get(s.r2_key);
      if (s === null || object === null) throw new ApiError(404, 'Not found.');
      await managedAudit(c, 'managed_statement_downloaded', 'managed_statement', statementId, {
        month: s.month,
      }).run();
      return new Response(object.body, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="statement.pdf"',
          'cache-control': 'private, no-store',
        },
      });
    },
  );

  r.get('/owner/managed-units', requireRole('owner'), async (c) => {
    const today = dubaiDate(c.get('now'));
    const { results } = await c.env.DB.prepare(
      `${MANAGED_SELECT} WHERE ${OWNER_SEES} ORDER BY m.ended_at IS NOT NULL, m.set_at DESC LIMIT 50`,
    )
      .bind(c.get('auth').userId)
      .all<ManagedRow>();
    const units = await Promise.all(
      results.map(async (m) => ({
        ...arrangementView(m, today),
        statements: await statementsOf(c.env.DB, m.id),
      })),
    );
    return c.json({ units });
  });

  return r;
}
