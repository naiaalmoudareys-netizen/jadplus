/**
 * A consultation as each person sees it (ADR 0031; O5, P5):
 *
 * - GET /api/requests/:id/consultation   the answers, best time to call, consent, the provider's steps (with
 *   notes for the owner), the office's next steps and whether the office may open the owner's contact details.
 *   Everyone who may see the request; { consultation: null } when it is not a consultation.
 * - GET /api/partner/jobs/:id/consultation/contact   the owner's name, email and mobile, for the provider office
 *   the owner agreed to share them with, while the request is open; every view is in the audit log.
 */
import {
  canViewRequest,
  consultationActions,
  contactSharedWith,
  dubaiDate,
  requestIdParam,
  type Status,
  type VisitSlot,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { personFields } from '../admin/ops/common.js';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { requestFacts } from '../requests/store.js';
import { parseParams } from '../validate.js';
import { readConsultation, readSteps, type ConsultationRow } from './store.js';

type Ctx = Context<AppEnv>;

interface RequestRow {
  id: string;
  status: Status;
  owner_user_id: string;
  tenancy_id: string | null;
  partner_id: string | null;
  preferred_date: string | null;
  preferred_slot: VisitSlot | null;
}

/** The request and its consultation if the signed-in person may see it (unknown and not-yours look alike). */
async function visible(c: Ctx, id: string): Promise<{ req: RequestRow; cons: ConsultationRow | null }> {
  const db = c.env.DB;
  const req = await db
    .prepare(
      `SELECT id, status, owner_user_id, tenancy_id, partner_id, preferred_date, preferred_slot
       FROM requests WHERE id = ?`,
    )
    .bind(id)
    .first<RequestRow>();
  if (req === null || !canViewRequest(c.get('auth'), await requestFacts(db, req), dubaiDate(c.get('now')))) {
    throw new ApiError(404, 'Not found.');
  }
  return { req, cons: await readConsultation(db, id) };
}

const contactFacts = (req: RequestRow, cons: ConsultationRow) => ({
  consentPartnerId: cons.consent_partner_id,
  assignedPartnerId: req.partner_id,
  status: req.status,
});

export function consultationViewRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get(
    '/requests/:id/consultation',
    requireRole('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      const { req, cons } = await visible(c, id);
      if (cons === null) return c.json({ consultation: null });
      const steps = await readSteps(c.env.DB, id);
      const actor = c.get('auth');
      return c.json({
        consultation: {
          serviceCode: cons.service_code,
          status: req.status,
          answers: JSON.parse(cons.answers) as Record<string, string>,
          bestTime:
            req.preferred_date === null || req.preferred_slot === null
              ? null
              : { date: req.preferred_date, slot: req.preferred_slot },
          consent: { at: cons.consented_at, version: cons.consent_version, providerName: cons.provider_name },
          steps,
          actions: consultationActions(actor.role, {
            serviceCode: cons.service_code,
            status: req.status,
            steps: steps.map((s) => s.step),
          }),
          contactShared: contactSharedWith(actor, contactFacts(req, cons)),
        },
      });
    },
  );

  r.get('/partner/jobs/:id/consultation/contact', requireRole('partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const { req, cons } = await visible(c, id);
    if (cons === null) throw new ApiError(404, 'Not found.');
    const actor = c.get('auth');
    if (!contactSharedWith(actor, contactFacts(req, cons))) {
      throw new ApiError(
        403,
        'The owner has not shared their contact details with your office on this request.',
      );
    }
    const db = c.env.DB;
    const owner = await db
      .prepare('SELECT id, name_enc, email_enc, phone_enc FROM users WHERE id = ?')
      .bind(req.owner_user_id)
      .first<{ id: string; name_enc: unknown; email_enc: unknown; phone_enc: unknown }>();
    if (owner === null) throw new ApiError(404, 'Not found.');
    // C-AUD-1: every look at the owner's details is recorded (who, when, which request), never the details.
    await db.batch([
      auditStatement(db, {
        at: c.get('now'),
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'consultation_contact_viewed',
        targetType: 'request',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { consentVersion: cons.consent_version },
      }),
    ]);
    return c.json(await personFields(c, owner));
  });

  return r;
}
