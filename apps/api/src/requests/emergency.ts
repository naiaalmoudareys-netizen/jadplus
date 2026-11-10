/**
 * Raising an emergency (BUILD_SPEC E1, E2, E3, E12, E14, L3; plan p.13 steps 1-2).
 *
 * - Fire, smoke, gas or injury (E3): no technician. The app shows only the emergency numbers; building FM
 *   and on-call are alerted.
 * - Water from shared parts or a neighbour (E12): the partner makes the unit safe AND building FM is told.
 *   Sprinklers/fire system: building FM only.
 * - AC failure counts as an emergency only from May to October (E14).
 * - Otherwise the job goes at once to the service's active primary partner (or the backup if the primary
 *   is suspended) with a loud alert, and the owner is told at the same moment that no action is needed (E1).
 * - The confirmation is exactly the L3 text. The app never gives instructions.
 */
import {
  EMERGENCY_ACK_MINUTES,
  EMERGENCY_NUMBERS,
  choosePartner,
  dispatchFor,
  dubaiDate,
  emergencyConfirmationText,
  isLifeSafety,
  isTenancyCurrent,
  qualifiesAsEmergency,
  type RaiseEmergencyBody,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement } from '../audit.js';
import type { Deps } from '../context.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import {
  MAINTENANCE,
  eventStatement,
  loadTenancy,
  newRef,
  notificationStatement,
  servicePartners,
} from './store.js';
import { ownsUnit } from '../owners/units.js';

type Ctx = Context<AppEnv>;

export type RaiseResult =
  | { readonly requestId: string; readonly ref: string; readonly confirmation: string }
  | {
      readonly requestId: string;
      readonly ref: string;
      readonly lifeSafety: true;
      readonly numbers: typeof EMERGENCY_NUMBERS;
    };

const NOT_FOUND = 'Not found.';

export interface Placement {
  readonly sfUnitId: string;
  readonly ownerUserId: string;
  readonly tenancyId: string | null;
}

/** Where a request is (emergency or routine), checked against who is asking (C-AZ-2). Unknown and not-yours look the same. */
export async function place(
  c: Ctx,
  deps: Deps,
  body: Pick<RaiseEmergencyBody, 'tenancyId' | 'sfUnitId'>,
  today: string,
): Promise<Placement> {
  const actor = c.get('auth');
  const db = c.env.DB;
  if (actor.role === 'tenant') {
    const t = body.tenancyId === undefined ? null : await loadTenancy(db, body.tenancyId);
    if (t?.tenantUserId !== actor.userId || !isTenancyCurrent(t, today)) {
      throw new ApiError(404, NOT_FOUND);
    }
    return { sfUnitId: t.sfUnitId, ownerUserId: t.ownerUserId, tenancyId: t.id };
  }
  if (body.sfUnitId === undefined) throw new ApiError(404, NOT_FOUND);
  if (!(await ownsUnit(c, deps, actor.userId, body.sfUnitId))) throw new ApiError(404, NOT_FOUND);
  // If the unit is let, the tenancy is linked so the tenant can follow the job too.
  const current = await db
    .prepare(
      `SELECT id FROM tenancies WHERE sf_unit_id = ? AND status = 'active' AND starts_on <= ? AND ends_on >= ?`,
    )
    .bind(body.sfUnitId, today, today)
    .first<{ id: string }>();
  return { sfUnitId: body.sfUnitId, ownerUserId: actor.userId, tenancyId: current?.id ?? null };
}

export async function raiseEmergency(c: Ctx, deps: Deps, body: RaiseEmergencyBody): Promise<RaiseResult> {
  const actor = c.get('auth');
  const db = c.env.DB;
  const now = c.get('now');
  const today = dubaiDate(now);
  const where = await place(c, deps, body, today);

  const lifeSafety = isLifeSafety(body.type);
  if (!isLifeSafety(body.type) && !qualifiesAsEmergency(body.type, Number(today.slice(5, 7)))) {
    throw new ApiError(422, 'From November to April an AC failure is handled as a routine request.', {
      body: { code: 'not_emergency' },
    });
  }

  const dispatch = lifeSafety ? { partner: false, buildingFm: true } : dispatchFor(body.faultSource);
  const { primary, backup } = await servicePartners(db, MAINTENANCE);
  const partner = dispatch.partner ? choosePartner(primary, backup) : null;
  const onCall = lifeSafety || (dispatch.partner && partner === null);

  const id = newId();
  const ref = newRef();
  const raisedBy = actor.role === 'tenant' ? 'tenant' : 'owner';
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
           raised_by_role, description, is_emergency, emergency_type, fault_source, status, partner_id, escalation,
           next_due_at, next_due_kind, created_at, updated_at, status_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        ref,
        MAINTENANCE,
        where.sfUnitId,
        where.ownerUserId,
        where.tenancyId,
        actor.userId,
        raisedBy,
        body.description,
        body.type,
        body.faultSource,
        partner === null ? 'submitted' : 'assigned',
        partner?.id ?? null,
        onCall && !lifeSafety ? 'on_call' : 'none',
        partner === null ? null : now + EMERGENCY_ACK_MINUTES * 60_000,
        partner === null ? null : 'emergency_ack',
        now,
        now,
        now,
      ),
    eventStatement(db, {
      requestId: id,
      at: now,
      actorUserId: actor.userId,
      actorRole: actor.role,
      kind: 'created',
      toStatus: 'submitted',
      data: { type: body.type, faultSource: body.faultSource },
    }),
  ];

  if (partner !== null) {
    statements.push(
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: null,
        actorRole: 'system',
        kind: 'status_changed',
        fromStatus: 'submitted',
        toStatus: 'assigned',
      }),
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: null,
        actorRole: 'system',
        kind: 'assigned',
        partnerId: partner.id,
      }),
      notificationStatement(db, {
        requestId: id,
        at: now,
        to: { kind: 'partner', partnerId: partner.id },
        template: 'emergency_new_job',
        urgent: true,
      }),
    );
  }
  if (dispatch.buildingFm) {
    statements.push(
      notificationStatement(db, {
        requestId: id,
        at: now,
        to: { kind: 'building_fm' },
        template: lifeSafety ? 'emergency_life_safety' : 'emergency_new_job',
        urgent: true,
      }),
    );
  }
  if (onCall) {
    statements.push(
      notificationStatement(db, {
        requestId: id,
        at: now,
        to: { kind: 'on_call' },
        template: lifeSafety ? 'emergency_life_safety' : 'emergency_on_call',
        urgent: true,
      }),
    );
  }
  if (where.ownerUserId !== actor.userId) {
    statements.push(
      notificationStatement(db, {
        requestId: id,
        at: now,
        to: { kind: 'user', userId: where.ownerUserId },
        template: 'emergency_owner_notice',
        urgent: false,
      }),
    );
  }
  statements.push(
    auditStatement(db, {
      at: now,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'emergency_raised',
      targetType: 'request',
      targetId: id,
      ipHash: c.get('ipHash'),
      httpRequestId: c.get('requestId'),
      detail: { type: body.type, partner: partner?.id ?? null, onCall },
    }),
  );
  await db.batch(statements);

  if (lifeSafety) return { requestId: id, ref, lifeSafety: true, numbers: EMERGENCY_NUMBERS };
  const provider =
    partner?.name ?? (dispatch.partner ? 'the JAD+ on-call team' : 'the building management team');
  return { requestId: id, ref, confirmation: emergencyConfirmationText(provider) };
}
