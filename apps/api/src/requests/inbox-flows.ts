/**
 * In-app notifications for the service flows (ADR 0035; O2, O3, O5, P5): consultations, reports and snags,
 * handover, investor education, managed-unit statements and furnishing deliveries. Like inbox.ts, every helper
 * returns ONE statement for the same batch as the change it describes, so the item exists exactly when the change
 * does. The item holds the kind and a few codes (InboxData), never words or personal data; the app writes the
 * sentence in the person's language (apps/mobile/src/inbox/).
 *
 * Recipients are read when the batch runs (the request's owner, the seat holders, the handover team's office), so
 * the caller passes ids only. Visibility when reading is in me/inbox.ts (inboxViewAllows in shared).
 */
import type { HandoverStep, InboxData, RequestOwnerKind, SessionKind, VisitSlot } from '@jadplus/shared';
import { newId } from '../crypto.js';

const json = (data: InboxData | undefined): string | null =>
  data === undefined || Object.keys(data).length === 0 ? null : JSON.stringify(data);

/**
 * An owner notification about a request: to the request's owner (requests.owner_user_id), never the tenant or
 * whoever raised it for them. `dedupeKey` (optional) makes it happen once per owner ("<key>:<owner id>").
 */
export function requestOwnerInboxStatement(
  db: D1Database,
  item: {
    readonly requestId: string;
    readonly kind: RequestOwnerKind;
    readonly at: number;
    readonly data?: InboxData;
    readonly dedupeKey?: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, request_id, kind, data, at, dedupe_key)
       SELECT ?1, r.owner_user_id, r.id, ?2, ?3, ?4, CASE WHEN ?5 IS NULL THEN NULL ELSE ?5 || ':' || r.owner_user_id END
       FROM requests r WHERE r.id = ?6`,
    )
    .bind(newId(), item.kind, json(item.data), item.at, item.dedupeKey ?? null, item.requestId);
}

/**
 * An education session notification (O5): to every owner holding a seat on the session now (seats given back are
 * left out). With `dedupeKey`, once per owner ("<key>:<user id>"), for the reminders job.
 */
export function sessionInboxStatement(
  db: D1Database,
  item: {
    readonly sessionId: string;
    readonly kind: SessionKind;
    readonly at: number;
    readonly data?: InboxData;
    readonly dedupeKey?: string;
    /** Only seats taken before this time (the reminder skips a seat taken just before the start). */
    readonly bookedBefore?: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, session_id, kind, data, at, dedupe_key)
       SELECT lower(hex(randomblob(16))), b.user_id, b.session_id, ?1, ?2, ?3,
              CASE WHEN ?4 IS NULL THEN NULL ELSE ?4 || ':' || b.user_id END
       FROM education_bookings b WHERE b.session_id = ?5 AND b.cancelled_at IS NULL
         AND (?6 IS NULL OR b.booked_at < ?6)`,
    )
    .bind(
      item.kind,
      json(item.data),
      item.at,
      item.dedupeKey ?? null,
      item.sessionId,
      item.bookedBefore ?? null,
    );
}

/** An owner notification that points at nothing (UNTARGETED_KINDS): the book was sent, a statement. */
export function userInboxStatement(
  db: D1Database,
  item: {
    readonly userId: string;
    readonly kind: 'book_sent' | 'statement_ready';
    readonly at: number;
    readonly data?: InboxData;
    readonly dedupeKey?: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, kind, data, at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      item.userId,
      item.kind,
      json(item.data),
      item.at,
      item.dedupeKey === undefined ? null : `${item.dedupeKey}:${item.userId}`,
    );
}

/**
 * O3: "snags to fix" for the JAD Global teams assigned to the handover service (active, the same rule as
 * snag-access.ts handoverTeams), to their office only (partner_admin): the team fixes snags from the console.
 * The request's own provider is left out (soft snagging: the team is the provider and gets its own items).
 */
export function handoverTeamInboxStatement(
  db: D1Database,
  item: { readonly requestId: string; readonly at: number; readonly data?: InboxData },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, request_id, kind, data, at)
       SELECT lower(hex(randomblob(16))), g.user_id, r.id, 'snags_to_fix', ?1, ?2
       FROM user_roles g JOIN requests r ON r.id = ?3
       WHERE g.role = 'partner_admin' AND g.revoked_at IS NULL AND g.partner_id IS NOT r.partner_id
         AND g.partner_id IN (
           SELECT sp.partner_id FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
           WHERE sp.service_code = 'handover' AND sp.ended_at IS NULL AND p.kind = 'jad_group' AND p.status = 'active')`,
    )
    .bind(json(item.data), item.at, item.requestId);
}

// Ready-made helpers for the flows built next (wave 3: managed units, furnishing, interior design).

/**
 * A stage reached on a request (consultation stages; interior design project stages): "Mortgage: Pre-approval".
 * `stage` is the stage id the app translates (strings key `stage.<id>` or `cons.step.<id>`).
 */
export function stageReachedStatement(
  db: D1Database,
  s: {
    readonly requestId: string;
    readonly service: string;
    readonly stage: string;
    readonly hasNote: boolean;
    readonly at: number;
  },
): D1PreparedStatement {
  return requestOwnerInboxStatement(db, {
    requestId: s.requestId,
    kind: 'stage_reached',
    at: s.at,
    data: { service: s.service, stage: s.stage, hasNote: s.hasNote },
  });
}

/** A furnishing delivery booked (moved = false) or moved, on its request: the day and, if known, the window. */
export function deliveryScheduledStatement(
  db: D1Database,
  d: {
    readonly requestId: string;
    readonly date: string;
    readonly slot?: VisitSlot;
    readonly moved: boolean;
    readonly at: number;
  },
): D1PreparedStatement {
  return requestOwnerInboxStatement(db, {
    requestId: d.requestId,
    kind: 'delivery_scheduled',
    at: d.at,
    data: { date: d.date, moved: d.moved, ...(d.slot === undefined ? {} : { slot: d.slot }) },
  });
}

/**
 * A managed unit's statement is ready for `period` (YYYY-MM): on its request when there is one (the app opens
 * the request), otherwise to the owner `userId` (the app opens My unit → Documents). Once per period and owner.
 */
export function statementReadyStatement(
  db: D1Database,
  s: { readonly period: string; readonly at: number } & (
    { readonly requestId: string } | { readonly userId: string }
  ),
): D1PreparedStatement {
  const data: InboxData = { period: s.period };
  return 'requestId' in s
    ? requestOwnerInboxStatement(db, {
        requestId: s.requestId,
        kind: 'statement_ready',
        at: s.at,
        data,
        dedupeKey: `statement:${s.requestId}:${s.period}`,
      })
    : userInboxStatement(db, {
        userId: s.userId,
        kind: 'statement_ready',
        at: s.at,
        data,
        dedupeKey: `statement:${s.period}`,
      });
}

/** O2: a handover checklist step done ("keys collected" is handover_complete instead). */
export function handoverStepStatement(
  db: D1Database,
  h: {
    readonly requestId: string;
    readonly step: HandoverStep;
    readonly hasNote: boolean;
    readonly at: number;
  },
): D1PreparedStatement {
  return h.step === 'keys_collected'
    ? requestOwnerInboxStatement(db, { requestId: h.requestId, kind: 'handover_complete', at: h.at })
    : requestOwnerInboxStatement(db, {
        requestId: h.requestId,
        kind: 'handover_step_done',
        at: h.at,
        data: { step: h.step, hasNote: h.hasNote },
      });
}
