/**
 * The provider office's steps on a consultation (ADR 0031; O5, P5, S4), in the console:
 *
 * - POST /api/partner/jobs/:id/consultation/contact-made   first contact: the request moves to in progress, the
 *   first deadline is met (or missed) on the scorecard, and the service's next deliverable becomes the deadline
 *   (leasing: listing in 3 working days; resale: valuation and sales plan in 3 working days; Golden Visa: the
 *   eligibility answer keeps its own deadline).
 * - POST /api/partner/jobs/:id/consultation/stage          the next stage reached (forward only), with an
 *   optional note the owner sees.
 * - POST /api/partner/jobs/:id/consultation/close          Done, or Did not proceed with the reason the owner
 *   sees (P5). The request moves to "completed"; the owner closes it (or it closes by itself after 72 hours, A4).
 *
 * Only the office of the provider the request is with (C-AZ-2), only when consultation-flow.ts allows the step;
 * each step is one atomic batch with its history and audit entry, guarded against a change at the same moment.
 * Notes are saved with contact details masked (ADR 0009: contact goes through JAD+).
 */
import {
  canActOnRequest,
  closeConsultationBody,
  consultationActions,
  consultationStageBody,
  contactMadeBody,
  contactMeetsDeadline,
  dubaiDate,
  dueAfterContact,
  MANAGEMENT_ACTIVE_STAGE,
  MANAGEMENT_SERVICE_CODE,
  maskContactDetails,
  nextStages,
  requestIdParam,
  slaMet,
  stageMeetsDeadline,
  type ConsultationAction,
  type ConsultationDue,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { loadCalendar } from '../calendar.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedAudit, startArrangementStatements } from '../managed/store.js';
import { withConflictCheck } from '../requests/concurrency.js';
import { readFlowRow, type FlowRow } from '../requests/flow.js';
import { requestOwnerInboxStatement, stageReachedStatement } from '../requests/inbox-flows.js';
import { requestFacts } from '../requests/store.js';
import { changeStatements } from '../requests/transition.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { readConsultation, readSteps, stepStatement, type ConsultationRow } from './store.js';

type Ctx = Context<AppEnv>;

interface Loaded {
  readonly row: FlowRow;
  /** The provider the request is with (the signed-in office's company). */
  readonly partnerId: string;
  readonly cons: ConsultationRow;
  readonly steps: readonly string[];
  readonly due: ConsultationDue | null;
}

/** The consultation if this office may act on it AND take `action` now: 404 not theirs, 409 not now. */
async function loadForStep(c: Ctx, id: string, action: ConsultationAction): Promise<Loaded> {
  const db = c.env.DB;
  const actor = c.get('auth');
  const row = await readFlowRow(db, id);
  if (row === null || !canActOnRequest(actor, await requestFacts(db, row), dubaiDate(c.get('now')))) {
    throw new ApiError(404, 'Not found.');
  }
  const partnerId = row.partner_id;
  if (partnerId === null) throw new ApiError(404, 'Not found.');
  const cons = await readConsultation(db, id);
  if (cons === null) throw new ApiError(404, 'Not found.');
  const steps = (await readSteps(db, id)).map((s) => s.step);
  if (
    !consultationActions(actor.role, { serviceCode: cons.service_code, status: row.status, steps }).includes(
      action,
    )
  ) {
    throw new ApiError(409, 'This step is not possible for this request now. Refresh and try again.');
  }
  const due =
    row.next_due_at === null || row.next_due_kind === null
      ? null
      : { at: row.next_due_at, kind: row.next_due_kind };
  return { row, partnerId, cons, steps, due };
}

/** S4/S5: the deadline the provider just answered, measured once on the scorecard (met or missed). */
function milestoneStatement(c: Ctx, l: Loaded, due: ConsultationDue): D1PreparedStatement {
  const now = c.get('now');
  const met = slaMet(due.at, now);
  return c.env.DB.prepare(
    `INSERT OR IGNORE INTO sla_outcomes (id, request_id, partner_id, metric, due_at, met_at, outcome, recorded_at)
     VALUES (?, ?, ?, 'service_milestone', ?, ?, ?, ?)`,
  ).bind(newId(), l.row.id, l.partnerId, due.at, met ? now : null, met ? 'met' : 'missed', now);
}

const masked = (note: string | undefined): string | null =>
  note === undefined ? null : maskContactDetails(note).text.slice(0, 500);

function step(c: Ctx, l: Loaded, id: string, note: string | null): D1PreparedStatement {
  return stepStatement(c.env.DB, {
    requestId: l.row.id,
    step: id,
    note,
    partnerId: l.partnerId,
    actorUserId: c.get('auth').userId,
    at: c.get('now'),
  });
}

/** O4 (ADR 0034): the statements that start managing the owner's unit when its property management is Active. */
function managementStarts(c: Ctx, l: Loaded, serviceCode: string, stage: string): D1PreparedStatement[] {
  if (serviceCode !== MANAGEMENT_SERVICE_CODE || stage !== MANAGEMENT_ACTIVE_STAGE) return [];
  const id = newId();
  return [
    ...startArrangementStatements(c, {
      id,
      sfUnitId: l.row.sf_unit_id,
      ownerUserId: l.row.owner_user_id,
      providerId: l.partnerId,
      source: 'consultation',
      requestId: l.row.id,
      since: dubaiDate(c.get('now')),
      until: null,
    }),
    managedAudit(c, 'managed_unit_set', 'managed_unit', id, {
      source: 'consultation',
      provider: l.partnerId,
    }),
  ];
}

function present<T>(x: T | null): x is T {
  return x !== null;
}

export function consultationStepRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/partner/jobs/:id/consultation/contact-made', requireRole('partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, contactMadeBody);
    const l = await loadForStep(c, id, 'contact_made');
    const { row, cons, due } = l;
    const cal = await loadCalendar(c.env.DB);
    const next = dueAfterContact(cons.service_code, c.get('now'), due, cal);
    const sla = due !== null && contactMeetsDeadline(due) ? milestoneStatement(c, l, due) : null;
    await withConflictCheck(() =>
      c.env.DB.batch(
        [
          ...changeStatements(c, row, {
            to: 'in_progress',
            nextDue: next,
            audit: 'consultation_contact_made',
            detail: { service: cons.service_code },
          }),
          step(c, l, 'contact_made', masked(body.note)),
          // ADR 0035: the owner is told the provider has been in touch.
          requestOwnerInboxStatement(c.env.DB, {
            requestId: id,
            kind: 'consultation_contact_made',
            at: c.get('now'),
            data: { service: cons.service_code, hasNote: body.note !== undefined },
          }),
          sla,
        ].filter(present),
      ),
    );
    return c.json({ id, status: 'in_progress' });
  });

  r.post('/partner/jobs/:id/consultation/stage', requireRole('partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, consultationStageBody);
    const l = await loadForStep(c, id, 'move_stage');
    const { row, cons, steps, due } = l;
    if (!nextStages(cons.service_code, steps).includes(body.stage)) {
      throw new ApiError(400, 'Choose one of the next stages of this service.');
    }
    const delivered = stageMeetsDeadline(cons.service_code, body.stage, due);
    await withConflictCheck(() =>
      c.env.DB.batch(
        [
          ...changeStatements(c, row, {
            to: 'in_progress',
            nextDue: delivered ? null : due,
            audit: 'consultation_stage_moved',
            detail: { service: cons.service_code, stage: body.stage },
          }),
          step(c, l, body.stage, masked(body.note)),
          stageReachedStatement(c.env.DB, {
            requestId: id,
            service: cons.service_code,
            stage: body.stage,
            hasNote: body.note !== undefined,
            at: c.get('now'),
          }),
          delivered && due !== null ? milestoneStatement(c, l, due) : null,
          // ADR 0034: property management reaching "Active" makes the unit managed by this team.
          ...managementStarts(c, l, cons.service_code, body.stage),
        ].filter(present),
      ),
    );
    return c.json({ id, status: 'in_progress' });
  });

  r.post('/partner/jobs/:id/consultation/close', requireRole('partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, closeConsultationBody);
    const l = await loadForStep(c, id, 'close');
    const { row, cons, due } = l;
    await withConflictCheck(() =>
      c.env.DB.batch(
        [
          ...changeStatements(c, row, {
            to: 'completed',
            nextDue: null,
            audit: 'consultation_closed',
            detail: { service: cons.service_code, outcome: body.outcome },
          }),
          step(c, l, body.outcome, masked(body.note)),
          // P5: done (the owner closes it) or did not go ahead (the reason is on the request).
          requestOwnerInboxStatement(c.env.DB, {
            requestId: id,
            kind: 'consultation_closed',
            at: c.get('now'),
            data: { service: cons.service_code, outcome: body.outcome, hasNote: body.note !== undefined },
          }),
          // Ending it answers whatever deliverable was still due (an eligibility "no" is an answer too).
          due === null ? null : milestoneStatement(c, l, due),
        ].filter(present),
      ),
    );
    return c.json({ id, status: 'completed' });
  });

  return r;
}
