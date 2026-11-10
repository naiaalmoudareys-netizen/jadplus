/**
 * Contract documents (ADR 0025; S7, S10, P3), partner_admin, own company only:
 *
 * - GET  /api/partner/documents                           licence, insurance, signed SOP/SLA/KPI, rate card:
 *                                                         latest verified expiry, standing, upload waiting
 * - POST /api/partner/documents/:kind?expiresOn=YYYY-MM-DD the PDF as the raw body, at most 15 MB
 *
 * An upload counts only once JAD+ Admin has checked and accepted it (apps/api/src/admin/partner-extras.ts):
 * then the daily partner check uses its expiry (S7). The type is taken from the file's own bytes ("%PDF-"),
 * never from its name; the client's filename is never stored; the file is kept in private R2 (C-UPL-1).
 */
import {
  PARTNER_DOCUMENT_KINDS,
  PARTNER_DOCUMENT_MAX_BYTES,
  documentKindParam,
  documentUploadQuery,
  dubaiDate,
  expiryRequired,
  isPdf,
  partnerDocumentStanding,
  type PartnerDocumentKind,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { decryptField, newId, toBytes } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseParams, parseQuery } from '../../validate.js';
import { audit, companyOf } from './common.js';
import { verifiedDocuments } from './overview.js';

/** The upload route takes a PDF-sized body instead of the API's 64 KB JSON limit (app.ts). */
export const PARTNER_DOCUMENT_UPLOAD_PATH =
  /^\/api\/partner\/documents\/(trade_licence|insurance|signed_sop_sla_kpi|rate_card)$/;

/** Encryption context of a rejection reason written by JAD+ Admin. */
export const uploadReasonContext = (id: string): string => `partner_document_uploads.reason:${id}`;

/** SHA-256 of the stored file (evidence that it was not changed later). */
export async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

interface UploadRow {
  id: string;
  kind: PartnerDocumentKind;
  status: 'pending' | 'accepted' | 'rejected';
  expires_on: string | null;
  uploaded_at: number;
  decided_at: number | null;
  reason_enc: unknown;
}

export function registerDocuments(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');

  r.get('/documents', office, async (c) => {
    const partnerId = companyOf(c);
    const today = dubaiDate(c.get('now'));
    const verified = await verifiedDocuments(c.env.DB, partnerId);
    // Per kind: the upload waiting, and the latest decided one (shown when it was a rejection).
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.kind, u.status, u.expires_on, u.uploaded_at, u.decided_at, u.reason_enc
       FROM partner_document_uploads u WHERE u.partner_id = ?1 AND (u.status = 'pending' OR u.rowid =
         (SELECT x.rowid FROM partner_document_uploads x WHERE x.partner_id = ?1 AND x.kind = u.kind
            AND x.status <> 'pending' ORDER BY x.decided_at DESC, x.rowid DESC LIMIT 1))`,
    )
      .bind(partnerId)
      .all<UploadRow>();
    const keys = c.get('keys');
    const documents = await Promise.all(
      PARTNER_DOCUMENT_KINDS.map(async (kind) => {
        const expiresOn = verified.get(kind);
        const pending = results.find((u) => u.kind === kind && u.status === 'pending');
        const rejected = results.find((u) => u.kind === kind && u.status === 'rejected');
        return {
          kind,
          onFile: expiresOn !== undefined,
          expiresOn: expiresOn ?? null,
          standing: partnerDocumentStanding(expiresOn === undefined ? null : { expiresOn }, today),
          pending:
            pending === undefined
              ? null
              : { id: pending.id, uploadedAt: pending.uploaded_at, expiresOn: pending.expires_on },
          lastRejected:
            rejected === undefined || rejected.decided_at === null
              ? null
              : {
                  at: rejected.decided_at,
                  reason: await decryptField(
                    keys,
                    toBytes(rejected.reason_enc),
                    uploadReasonContext(rejected.id),
                  ),
                },
        };
      }),
    );
    return c.json({ documents });
  });

  r.post('/documents/:kind', office, async (c) => {
    const { kind } = parseParams(c, documentKindParam);
    const { expiresOn } = parseQuery(c, documentUploadQuery);
    const partnerId = companyOf(c);
    const today = dubaiDate(c.get('now'));
    if (expiresOn === undefined && expiryRequired(kind)) {
      throw new ApiError(400, 'Give the expiry date printed on the document.');
    }
    if (expiresOn !== undefined && expiresOn <= today) {
      throw new ApiError(400, 'This document has already expired. Please upload the renewed one.');
    }
    const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > PARTNER_DOCUMENT_MAX_BYTES) {
      throw new ApiError(413, 'Documents can be up to 15 MB.');
    }
    if (declared !== 'application/pdf' || !isPdf(bytes)) throw new ApiError(415, 'Please upload a PDF.');
    const db = c.env.DB;
    const waiting = await db
      .prepare(
        "SELECT id FROM partner_document_uploads WHERE partner_id = ? AND kind = ? AND status = 'pending'",
      )
      .bind(partnerId, kind)
      .first<{ id: string }>();
    if (waiting !== null) {
      throw new ApiError(409, 'A document of this kind is already waiting for JAD+ to check it.');
    }
    const id = newId();
    const key = `partners/${partnerId}/documents/${id}.pdf`;
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    await db.batch([
      db
        .prepare(
          `INSERT INTO partner_document_uploads
             (id, partner_id, kind, r2_key, byte_size, sha256, expires_on, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          partnerId,
          kind,
          key,
          bytes.length,
          await digest(bytes),
          expiresOn ?? null,
          c.get('auth').userId,
          c.get('now'),
        ),
      audit(c, 'partner_document_uploaded', 'partner_document_upload', id, { kind, bytes: bytes.length }),
    ]);
    return c.json({ id, kind, status: 'pending' }, 201);
  });
}
