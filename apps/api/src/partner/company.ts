/**
 * The partner office, company tools (ADR 0025): overview, dispatch, messages, quotes, documents, rate card,
 * after-hours contacts, technicians' skills and availability, scorecard, feedback, export.
 *
 * Mounted at /api/partner, which the technicians' routes share: roles are declared on each route, never with a
 * '*' middleware. Office tools are partner_admin only; a technician (partner) may read their own skills, days
 * away and the after-hours weeks. Every query is bound to the session's company (C-AZ-2).
 */
import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import { registerAfterHours } from './company/after-hours.js';
import { registerDispatch } from './company/dispatch.js';
import { registerDocuments } from './company/documents.js';
import { registerLists } from './company/lists.js';
import { registerOverview } from './company/overview.js';
import { registerRateCard } from './company/rate-card.js';
import { registerScorecard } from './company/scorecard.js';

export { PARTNER_DOCUMENT_UPLOAD_PATH } from './company/documents.js';

export function partnerCompanyRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  registerOverview(r);
  registerDispatch(r);
  registerLists(r);
  registerDocuments(r);
  registerRateCard(r);
  registerAfterHours(r);
  registerScorecard(r);
  return r;
}
