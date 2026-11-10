/**
 * JAD+ Admin's side of the partner office tools (ADR 0025; S5, S7, S9, S10, P1). Reading: jad_admin and
 * jad_viewer; deciding: jad_admin only, audited in the same batch (C-AUD-1).
 *
 * - GET  /api/admin/partner-documents?status=pending   documents partners uploaded
 * - GET  /api/admin/partner-documents/:id/file         the PDF (private, never cached; the viewing is audited)
 * - POST /api/admin/partner-documents/:id/verify       {decision, reason?}: accepting writes the partner_documents
 *                                                      row the daily check reads (S7); a rejection says why
 * - GET  /api/admin/rate-card-changes?status=pending   proposed rate cards, each line next to today's price
 * - POST /api/admin/rate-card-changes/:id              {decision, approvedBy, reason?}: who approved in writing
 * - GET  /api/admin/partners/:id/scorecard?month=      a partner's monthly scorecard (S5)
 *
 * Free text written here (reasons, the approver's name) is stored encrypted (C-PD-2) and never audited.
 */
import {
  decideRateChangeBody,
  dubaiDate,
  monthOf,
  monthQuery,
  partnerDocumentsQuery,
  rateCardChangesQuery,
  uploadIdParam,
  verifyDocumentBody,
  adminPartnerParam,
  type PartnerDocumentKind,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { decryptField, encryptField, newId, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit } from '../partner/company/common.js';
import { uploadReasonContext } from '../partner/company/documents.js';
import {
  acceptedCards,
  cardItems,
  rateApproverContext,
  rateReason,
  rateReasonContext,
} from '../partner/company/rate-card.js';
import { scorecardFor } from '../partner/company/scorecard.js';
import { parseJsonBody, parseParams, parseQuery } from '../validate.js';

type Decided = 'pending' | 'accepted' | 'rejected';

export function adminPartnerExtrasRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  // Per route, not r.use('*'): /api/admin is shared with the other admin routers.
  const read = requireRole('jad_admin', 'jad_viewer');
  const write = requireRole('jad_admin');

  r.get('/partner-documents', read, async (c) => {
    const { status } = parseQuery(c, partnerDocumentsQuery);
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.partner_id, p.name AS partner_name, u.kind, u.expires_on, u.byte_size, u.uploaded_at,
         u.status, u.decided_at, u.reason_enc
       FROM partner_document_uploads u JOIN partners p ON p.id = u.partner_id
       WHERE u.status = ? ORDER BY u.uploaded_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    )
      .bind(status)
      .all<{
        id: string;
        partner_id: string;
        partner_name: string;
        kind: PartnerDocumentKind;
        expires_on: string | null;
        byte_size: number;
        uploaded_at: number;
        status: Decided;
        decided_at: number | null;
        reason_enc: unknown;
      }>();
    const keys = c.get('keys');
    const uploads = await Promise.all(
      results.map(async (u) => ({
        id: u.id,
        partnerId: u.partner_id,
        partnerName: u.partner_name,
        kind: u.kind,
        expiresOn: u.expires_on,
        byteSize: u.byte_size,
        uploadedAt: u.uploaded_at,
        status: u.status,
        decidedAt: u.decided_at,
        reason:
          u.reason_enc === null
            ? null
            : await decryptField(keys, toBytes(u.reason_enc), uploadReasonContext(u.id)),
      })),
    );
    return c.json({ uploads });
  });

  r.get('/partner-documents/:id/file', read, async (c) => {
    const { id } = parseParams(c, uploadIdParam);
    const row = await c.env.DB.prepare('SELECT r2_key FROM partner_document_uploads WHERE id = ?')
      .bind(id)
      .first<{ r2_key: string }>();
    const object = row === null ? null : await c.env.MEDIA.get(row.r2_key);
    if (object === null) throw new ApiError(404, 'Not found.');
    await audit(c, 'partner_document_viewed', 'partner_document_upload', id).run();
    return new Response(object.body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
      },
    });
  });

  r.post('/partner-documents/:id/verify', write, async (c) => {
    const { id } = parseParams(c, uploadIdParam);
    const body = await parseJsonBody(c, verifyDocumentBody);
    const db = c.env.DB;
    const now = c.get('now');
    const me = c.get('auth').userId;
    const upload = await db
      .prepare("SELECT kind FROM partner_document_uploads WHERE id = ? AND status = 'pending'")
      .bind(id)
      .first<{ kind: PartnerDocumentKind }>();
    if (upload === null) throw new ApiError(404, 'Not found.');
    if (body.decision === 'accept') {
      const documentId = newId();
      await db.batch([
        // S7: the verified copy is what the daily partner check reads.
        db
          .prepare(
            `INSERT INTO partner_documents (id, partner_id, kind, r2_key, expires_on, uploaded_at, uploaded_by)
             SELECT ?, partner_id, kind, r2_key, expires_on, uploaded_at, uploaded_by
             FROM partner_document_uploads WHERE id = ? AND status = 'pending'`,
          )
          .bind(documentId, id),
        db
          .prepare(
            `UPDATE partner_document_uploads SET status = 'accepted', decided_by = ?, decided_at = ?, document_id = ?
             WHERE id = ? AND status = 'pending'`,
          )
          .bind(me, now, documentId, id),
        audit(c, 'partner_document_accepted', 'partner_document_upload', id, { kind: upload.kind }),
      ]);
      return c.json({ id, status: 'accepted' });
    }
    const reason = await encryptField(c.get('keys'), body.reason ?? '', uploadReasonContext(id));
    await db.batch([
      db
        .prepare(
          `UPDATE partner_document_uploads SET status = 'rejected', decided_by = ?, decided_at = ?, reason_enc = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(me, now, reason, id),
      audit(c, 'partner_document_rejected', 'partner_document_upload', id, { kind: upload.kind }),
    ]);
    return c.json({ id, status: 'rejected' });
  });

  r.get('/rate-card-changes', read, async (c) => {
    const { status } = parseQuery(c, rateCardChangesQuery);
    const db = c.env.DB;
    const today = dubaiDate(c.get('now'));
    const { results } = await db
      .prepare(
        `SELECT ch.id, ch.partner_id, p.name AS partner_name, ch.status, ch.effective_from, ch.valid_until,
           ch.proposed_at, ch.decided_at, ch.approved_by_enc, ch.reason_enc
         FROM rate_card_changes ch JOIN partners p ON p.id = ch.partner_id
         WHERE ch.status = ? ORDER BY ch.proposed_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`,
      )
      .bind(status)
      .all<{
        id: string;
        partner_id: string;
        partner_name: string;
        status: Decided;
        effective_from: string;
        valid_until: string;
        proposed_at: number;
        decided_at: number | null;
        approved_by_enc: unknown;
        reason_enc: unknown;
      }>();
    const keys = c.get('keys');
    const changes = await Promise.all(
      results.map(async (ch) => {
        const { current } = await acceptedCards(db, ch.partner_id, today);
        const priceNow = (i: { serviceCode: string; item: string; unit: string }) =>
          current?.items.find(
            (x) =>
              x.serviceCode === i.serviceCode &&
              x.unit === i.unit &&
              x.item.toLowerCase() === i.item.toLowerCase(),
          )?.priceFils ?? null;
        return {
          id: ch.id,
          partnerId: ch.partner_id,
          partnerName: ch.partner_name,
          status: ch.status,
          effectiveFrom: ch.effective_from,
          validUntil: ch.valid_until,
          proposedAt: ch.proposed_at,
          decidedAt: ch.decided_at,
          approvedBy:
            ch.approved_by_enc === null
              ? null
              : await decryptField(keys, toBytes(ch.approved_by_enc), rateApproverContext(ch.id)),
          reason: await rateReason(keys, ch.id, ch.reason_enc),
          items: (await cardItems(db, ch.id)).map((i) => ({ ...i, currentPriceFils: priceNow(i) })),
        };
      }),
    );
    return c.json({ changes });
  });

  r.post('/rate-card-changes/:id', write, async (c) => {
    const { id } = parseParams(c, uploadIdParam);
    const body = await parseJsonBody(c, decideRateChangeBody);
    const db = c.env.DB;
    const keys = c.get('keys');
    const change = await db
      .prepare("SELECT partner_id FROM rate_card_changes WHERE id = ? AND status = 'pending'")
      .bind(id)
      .first<{ partner_id: string }>();
    if (change === null) throw new ApiError(404, 'Not found.');
    const accepted = body.decision === 'accept';
    const approvedBy =
      accepted && body.approvedBy !== undefined
        ? await encryptField(keys, body.approvedBy, rateApproverContext(id))
        : null;
    const reason =
      body.reason === undefined ? null : await encryptField(keys, body.reason, rateReasonContext(id));
    const status = accepted ? 'accepted' : 'rejected';
    await db.batch([
      db
        .prepare(
          `UPDATE rate_card_changes SET status = ?, decided_by = ?, decided_at = ?, approved_by_enc = ?, reason_enc = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(status, c.get('auth').userId, c.get('now'), approvedBy, reason, id),
      audit(c, accepted ? 'rate_card_change_accepted' : 'rate_card_change_rejected', 'rate_card_change', id, {
        partner: change.partner_id,
      }),
    ]);
    return c.json({ id, status });
  });

  r.get('/partners/:id/scorecard', read, async (c) => {
    const { id } = parseParams(c, adminPartnerParam);
    const { month } = parseQuery(c, monthQuery);
    const partner = await c.env.DB.prepare('SELECT id, name FROM partners WHERE id = ?')
      .bind(id)
      .first<{ id: string; name: string }>();
    if (partner === null) throw new ApiError(404, 'Not found.');
    return c.json(await scorecardFor(c.env.DB, partner, month ?? monthOf(c.get('now'))));
  });

  return r;
}
