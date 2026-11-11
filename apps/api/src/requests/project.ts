/**
 * Furnishing delivery dates and interior design stages (ADR 0034; O5, S4, L4, C-AZ-2, C-AUD-1).
 *
 * - GET  /api/requests/:id/project                 the delivery date (with the reason of the latest move) and the
 *                                                  stage timeline, and the person's steps
 * - PUT  /api/partner/jobs/:id/delivery            set or move the delivery date and window (furnishing, after the
 *                                                  owner approved the quote); console and technician app
 * - POST /api/partner/jobs/:id/project-stage       the next design stage reached, with an optional note (the
 *                                                  office, console)
 *
 * Only the provider the job is assigned to (canActOnRequest) and only when project-delivery.ts allows it. Each
 * change is one batch with a guarded touch of the request (two changes at once cannot both win), its history row
 * (append-only) and the audit entry. Reasons and notes are shown to the owner with contact details masked
 * (ADR 0009). Tenants never see this (furnishing and design are the owner's services, R2).
 */
import {
  canActOnRequest,
  deliveryAllowed,
  deliveryBody,
  deliveryRefusal,
  DELIVERY_MESSAGES,
  dubaiDate,
  maskContactDetails,
  nextProjectStages,
  projectStageBody,
  projectTimeline,
  requestIdParam,
  stagesAllowed,
  type ProjectState,
  type RequestProject,
  type VisitSlot,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedAudit } from '../managed/store.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { versionGuard, withConflictCheck } from './concurrency.js';
import { readFlowRow, type FlowRow } from './flow.js';
import { deliveryScheduledStatement, stageReachedStatement } from './inbox-flows.js';
import { visibleRequest } from './resident.js';
import { requestFacts } from './store.js';

type Ctx = Context<AppEnv>;

interface DeliveryRow {
  delivery_date: string;
  slot: VisitSlot;
  reason: string | null;
  set_at: number;
}

async function projectState(db: D1Database, row: FlowRow): Promise<ProjectState> {
  const r = await db
    .prepare(
      `SELECT service_code, EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = ?1 AND q.status = 'approved') AS approved
       FROM requests WHERE id = ?1`,
    )
    .bind(row.id)
    .first<{ service_code: string; approved: number }>();
  return { serviceCode: r?.service_code ?? '', status: row.status, quoteApproved: r?.approved === 1 };
}

async function deliveries(db: D1Database, id: string): Promise<DeliveryRow[]> {
  const { results } = await db
    .prepare(
      'SELECT delivery_date, slot, reason, set_at FROM delivery_dates WHERE request_id = ? ORDER BY set_at DESC, rowid DESC',
    )
    .bind(id)
    .all<DeliveryRow>();
  return results;
}

async function stages(db: D1Database, id: string) {
  const { results } = await db
    .prepare('SELECT stage, at, note FROM project_stages WHERE request_id = ? ORDER BY at, rowid')
    .bind(id)
    .all<{ stage: string; at: number; note: string | null }>();
  return results;
}

/** The job if it is assigned to the signed-in provider (404 otherwise, C-AZ-2), with its state. */
async function providerJob(
  c: Ctx,
  id: string,
): Promise<{ row: FlowRow; state: ProjectState; partnerId: string }> {
  const db = c.env.DB;
  const row = await readFlowRow(db, id);
  const actor = c.get('auth');
  if (row === null || !canActOnRequest(actor, await requestFacts(db, row), dubaiDate(c.get('now')))) {
    throw new ApiError(404, 'Not found.');
  }
  if (row.partner_id === null) throw new ApiError(404, 'Not found.');
  return { row, state: await projectState(db, row), partnerId: row.partner_id };
}

/** Moves the request's version on, so a second change made at the same moment is refused (409). */
function touch(c: Ctx, row: FlowRow): D1PreparedStatement {
  return c.env.DB.prepare(`UPDATE requests SET updated_at = ?, ${versionGuard} WHERE id = ?`).bind(
    c.get('now'),
    row.version,
    row.id,
  );
}

const masked = (text: string | null): string | null =>
  text === null ? null : maskContactDetails(text).text.slice(0, 500);

export function projectRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get(
    '/requests/:id/project',
    requireRole('owner', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      await visibleRequest(c, id);
      const db = c.env.DB;
      const row = await readFlowRow(db, id);
      if (row === null) throw new ApiError(404, 'Not found.');
      const role = c.get('auth').role;
      const [state, moves, reached] = await Promise.all([
        projectState(db, row),
        deliveries(db, id),
        stages(db, id),
      ]);
      const latest = moves[0];
      const stageSteps = stagesAllowed(role, state);
      const answer: RequestProject = {
        serviceCode: state.serviceCode,
        delivery:
          latest === undefined
            ? null
            : {
                date: latest.delivery_date,
                slot: latest.slot,
                setAt: latest.set_at,
                reason: latest.reason,
                moves: moves.length - 1,
              },
        stages: reached.length === 0 && !stageSteps ? [] : projectTimeline(reached),
        canSetDelivery: deliveryAllowed(role, state),
        canMoveStage: stageSteps && nextProjectStages(reached.map((s) => s.stage)).length > 0,
        nextStages: stageSteps ? [...nextProjectStages(reached.map((s) => s.stage))] : [],
      };
      return c.json(answer);
    },
  );

  r.put('/partner/jobs/:id/delivery', requireRole('partner', 'partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, deliveryBody);
    const { row, state, partnerId } = await providerJob(c, id);
    if (!deliveryAllowed(c.get('auth').role, state)) {
      throw new ApiError(409, 'The delivery date is set after the owner approves the furnishing quote.');
    }
    const latest = (await deliveries(c.env.DB, id))[0];
    const reason = masked(body.reason);
    const refusal = deliveryRefusal(
      latest === undefined ? null : { date: latest.delivery_date, slot: latest.slot },
      { date: body.date, slot: body.slot, reason },
      dubaiDate(c.get('now')),
    );
    if (refusal !== null) throw new ApiError(400, DELIVERY_MESSAGES[refusal]);
    const moved = latest !== undefined;
    const db = c.env.DB;
    await withConflictCheck(() =>
      db.batch([
        touch(c, row),
        db
          .prepare(
            `INSERT INTO delivery_dates (id, request_id, delivery_date, slot, reason, partner_id, set_by, set_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId(),
            id,
            body.date,
            body.slot,
            moved ? reason : null,
            partnerId,
            c.get('auth').userId,
            c.get('now'),
          ),
        managedAudit(c, moved ? 'delivery_date_moved' : 'delivery_date_set', 'request', id, {
          date: body.date,
          slot: body.slot,
        }),
        deliveryScheduledStatement(db, {
          requestId: id,
          date: body.date,
          slot: body.slot,
          moved,
          at: c.get('now'),
        }),
      ]),
    );
    return c.json({ id, date: body.date, slot: body.slot, moved });
  });

  r.post('/partner/jobs/:id/project-stage', requireRole('partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, projectStageBody);
    const { row, state, partnerId } = await providerJob(c, id);
    if (!stagesAllowed(c.get('auth').role, state)) {
      throw new ApiError(409, 'Design stages start after the owner approves the quote.');
    }
    const reached = (await stages(c.env.DB, id)).map((s) => s.stage);
    if (!nextProjectStages(reached).includes(body.stage)) {
      throw new ApiError(400, 'Choose one of the next stages.');
    }
    const db = c.env.DB;
    await withConflictCheck(() =>
      db.batch([
        touch(c, row),
        db
          .prepare(
            `INSERT INTO project_stages (id, request_id, stage, note, partner_id, actor_user_id, at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(newId(), id, body.stage, masked(body.note), partnerId, c.get('auth').userId, c.get('now')),
        managedAudit(c, 'project_stage_moved', 'request', id, { stage: body.stage }),
        stageReachedStatement(db, {
          requestId: id,
          service: state.serviceCode,
          stage: body.stage,
          hasNote: body.note !== null,
          at: c.get('now'),
        }),
      ]),
    );
    return c.json({ id, stage: body.stage });
  });

  return r;
}
