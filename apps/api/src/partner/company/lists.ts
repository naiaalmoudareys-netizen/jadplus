/**
 * The office's working lists (ADR 0025; R3, A2, A3, S5, ADR 0009), partner_admin, own company only:
 *
 * - GET /api/partner/messages        open jobs with messages, newest first; "awaiting reply" when a resident
 *                                    spoke last. Text as stored: contact details were removed before saving.
 * - GET /api/partner/quotes?status=  every quote with days left before it expires (A2), and this month's totals
 * - GET /api/partner/feedback?month= ratings with comments, newest first: service and date only, never the
 *                                    resident's name or unit
 */
import {
  dubaiDate,
  daysLeft,
  monthOf,
  monthQuery,
  monthRange,
  partnerQuotesQuery,
  wholePercent,
  type Status,
  type UserRole,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { workspacePage } from '../workspace.js';
import type { AppEnv } from '../../env.js';
import { parseQuery } from '../../validate.js';
import { OPEN_SQL, companyOf } from './common.js';

const PREVIEW = 140;
const SERVICE = '(SELECT name FROM services WHERE code = r.service_code) AS service';

type QuoteStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'withdrawn';

function speaker(role: UserRole): 'resident' | 'partner' | 'jad' {
  if (role === 'owner' || role === 'tenant') return 'resident';
  return role === 'partner' || role === 'partner_admin' ? 'partner' : 'jad';
}

export function registerLists(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');

  r.get('/messages', office, workspacePage('messages'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.ref, r.status, ${SERVICE}, m.body, m.at, m.author_role,
         (SELECT count(*) FROM request_messages x WHERE x.request_id = r.id) AS n
       FROM requests r JOIN request_messages m ON m.rowid =
         (SELECT x.rowid FROM request_messages x WHERE x.request_id = r.id ORDER BY x.at DESC, x.rowid DESC LIMIT 1)
       WHERE r.partner_id = ? AND r.status IN (${OPEN_SQL}) ORDER BY m.at DESC LIMIT 200`,
    )
      .bind(companyOf(c))
      .all<{
        id: string;
        ref: string;
        status: Status;
        service: string | null;
        body: string;
        at: number;
        author_role: UserRole;
        n: number;
      }>();
    return c.json({
      threads: results.map((t) => {
        const from = speaker(t.author_role);
        return {
          requestId: t.id,
          ref: t.ref,
          service: t.service,
          status: t.status,
          messages: t.n,
          lastAt: t.at,
          lastFrom: from,
          preview: t.body.length > PREVIEW ? `${t.body.slice(0, PREVIEW - 1)}…` : t.body,
          awaitingReply: from === 'resident',
        };
      }),
    });
  });

  r.get('/quotes', office, workspacePage('quotes'), async (c) => {
    const { status } = parseQuery(c, partnerQuotesQuery);
    const partnerId = companyOf(c);
    const now = c.get('now');
    const db = c.env.DB;
    const { results } = await db
      .prepare(
        `SELECT q.id, q.request_id, r.ref, ${SERVICE}, q.amount_fils, q.status, q.revision, q.sent_at, q.expires_at
         FROM quotes q JOIN requests r ON r.id = q.request_id
         WHERE q.partner_id = ?1 AND (?2 IS NULL OR q.status = ?2) ORDER BY q.sent_at DESC, q.revision DESC, q.id LIMIT 500`,
      )
      .bind(partnerId, status ?? null)
      .all<{
        id: string;
        request_id: string;
        ref: string;
        service: string | null;
        amount_fils: number;
        status: QuoteStatus;
        revision: number;
        sent_at: number;
        expires_at: number;
      }>();
    const month = monthOf(now);
    const range = monthRange(month);
    const totals = await db
      .prepare(
        `SELECT count(*) AS sent, COALESCE(sum(amount_fils), 0) AS quoted,
           COALESCE(sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
           COALESCE(sum(CASE WHEN status = 'approved' THEN amount_fils ELSE 0 END), 0) AS approved_fils
         FROM quotes WHERE partner_id = ? AND sent_at >= ? AND sent_at < ?`,
      )
      .bind(partnerId, range.start, range.end)
      .first<{ sent: number; quoted: number; approved: number; approved_fils: number }>();
    const sent = totals?.sent ?? 0;
    const approved = totals?.approved ?? 0;
    return c.json({
      quotes: results.map((q) => ({
        id: q.id,
        requestId: q.request_id,
        ref: q.ref,
        service: q.service,
        amountFils: q.amount_fils,
        status: q.status,
        revision: q.revision,
        sentAt: q.sent_at,
        expiresAt: q.expires_at,
        daysLeft: q.status === 'pending' ? daysLeft(q.expires_at, now) : null,
      })),
      thisMonth: {
        month,
        sent,
        approved,
        quotedFils: totals?.quoted ?? 0,
        approvedFils: totals?.approved_fils ?? 0,
        conversionPercent: wholePercent(approved, sent),
      },
    });
  });

  r.get('/feedback', office, workspacePage('performance'), async (c) => {
    const { month: asked } = parseQuery(c, monthQuery);
    const month = asked ?? monthOf(c.get('now'));
    const { start, end } = monthRange(month);
    const { results } = await c.env.DB.prepare(
      `SELECT g.stars, g.comment, g.at, ${SERVICE} FROM ratings g JOIN requests r ON r.id = g.request_id
       WHERE g.partner_id = ? AND g.at >= ? AND g.at < ? ORDER BY g.at DESC LIMIT 500`,
    )
      .bind(companyOf(c), start, end)
      .all<{ stars: number; comment: string | null; at: number; service: string | null }>();
    return c.json({
      month,
      feedback: results.map((f) => ({
        stars: f.stars,
        comment: f.comment,
        service: f.service,
        date: dubaiDate(f.at),
      })),
    });
  });
}
