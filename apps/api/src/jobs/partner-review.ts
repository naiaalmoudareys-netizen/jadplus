/**
 * Daily partner check (BUILD_SPEC S6, S7, P3; ADR 0006), run by the Worker's daily cron.
 *
 * For every partner that is not ended:
 * 1. Documents (S7, P3): a licence or insurance expiring within 30 days goes on the admin review list; a lapsed
 *    or missing one suspends the partner at once. Their jobs still waiting for acknowledgement move to the
 *    other active partner of the service; jobs already under way go on the review list for an admin to move.
 *    A partner suspended by this check is reinstated automatically once both documents are valid again.
 * 2. Scorecard (S6): low ratings, two missed emergencies in 90 days, or a safety/honesty breach put the partner
 *    on the review list. Ending a contract stays a human decision.
 * Every change is audited and batched with its audit entry. Running it twice in a day changes nothing more.
 */
import {
  EMERGENCY_ACK_MINUTES,
  MISSED_EMERGENCY_WINDOW_DAYS,
  RATING_WINDOW_DAYS,
  complianceChange,
  dubaiDate,
  partnerCompliance,
  reviewFlags,
  reviewKey,
  suspensionReason,
  type Compliance,
  type SuspendedBy,
} from '@jadplus/shared';
import { auditStatement, type AuditAction } from '../audit.js';
import { newId } from '../crypto.js';
import type { Logger } from '../logger.js';
import { isVersionConflict, versionGuard } from '../requests/concurrency.js';
import { eventStatement, notificationStatement, servicePartners } from '../requests/store.js';

const MIN = 60_000;
const DAY = 86_400_000;

type ReviewKind =
  | 'low_rating'
  | 'missed_emergencies'
  | 'safety_breach'
  | 'honesty_breach'
  | 'document_expiring'
  | 'suspended'
  | 'open_jobs';

type Detail = Readonly<Record<string, string | number | boolean | null>>;

interface PartnerRow {
  id: string;
  status: 'active' | 'suspended';
  suspended_by: SuspendedBy | null;
}

export interface PartnerReviewResult {
  readonly partners: number;
  readonly suspended: number;
  readonly reinstated: number;
  readonly jobsMoved: number;
  readonly itemsOpened: number;
}

function audit(db: D1Database, now: number, action: AuditAction, type: string, id: string, detail?: Detail) {
  return auditStatement(db, {
    at: now,
    actorUserId: null,
    actorRole: 'system',
    action,
    targetType: type,
    targetId: id,
    ipHash: null,
    httpRequestId: null,
    ...(detail === undefined ? {} : { detail }),
  });
}

/** Adds an item to the review list unless the same concern is already open. Returns true if added. */
async function openItem(
  db: D1Database,
  now: number,
  partnerId: string,
  kind: ReviewKind,
  key: string,
  detail: Detail,
): Promise<boolean> {
  const open = await db
    .prepare(
      'SELECT 1 AS yes FROM partner_review_items WHERE partner_id = ? AND dedupe_key = ? AND resolved_at IS NULL',
    )
    .bind(partnerId, key)
    .first();
  if (open !== null) return false;
  const id = newId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO partner_review_items (id, partner_id, kind, dedupe_key, detail, opened_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, partnerId, kind, key, JSON.stringify(detail), now),
    audit(db, now, 'partner_flagged', 'partner', partnerId, { kind }),
  ]);
  return true;
}

async function latestDocuments(db: D1Database, partnerId: string) {
  const { results } = await db
    .prepare(
      `SELECT kind, MAX(expires_on) AS expires_on FROM partner_documents
       WHERE partner_id = ? AND kind IN ('trade_licence', 'insurance') GROUP BY kind`,
    )
    .bind(partnerId)
    .all<{ kind: 'trade_licence' | 'insurance'; expires_on: string }>();
  const of = (kind: string) => results.find((r) => r.kind === kind)?.expires_on ?? null;
  return { licence: of('trade_licence'), insurance: of('insurance') };
}

interface WaitingJob {
  id: string;
  service_code: string;
  owner_user_id: string;
  is_emergency: number;
  escalation: string;
  version: number;
}

/** S7 "jobs to backup": moves the suspended partner's jobs that nobody has started yet. Returns the count. */
async function moveWaitingJobs(db: D1Database, now: number, partnerId: string, log: Logger): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, service_code, owner_user_id, is_emergency, escalation, version FROM requests
       WHERE partner_id = ? AND status = 'assigned'`,
    )
    .bind(partnerId)
    .all<WaitingJob>();
  let moved = 0;
  for (const job of results) {
    const { primary, backup } = await servicePartners(db, job.service_code);
    const target = [primary, backup]
      .filter((p) => p !== null)
      .find((p) => p.status === 'active' && p.id !== partnerId);
    if (target === undefined) continue;
    const emergency = job.is_emergency === 1;
    const sys = { requestId: job.id, at: now, actorUserId: null, actorRole: 'system' as const };
    // The new partner must acknowledge afresh (E4); an emergency keeps escalating to on-call if they do not.
    const escalation = !emergency || job.escalation === 'on_call' ? job.escalation : 'moved_to_backup';
    const statements = [
      db
        .prepare(
          `UPDATE requests SET partner_id = ?, technician_id = NULL, acknowledged_at = NULL,
             arrival_window_start = NULL, arrival_window_end = NULL, escalation = ?,
             next_due_at = CASE WHEN ? THEN ? ELSE next_due_at END,
             next_due_kind = CASE WHEN ? THEN 'emergency_ack' ELSE next_due_kind END,
             updated_at = ?, ${versionGuard} WHERE id = ?`,
        )
        .bind(
          target.id,
          escalation,
          emergency ? 1 : 0,
          now + EMERGENCY_ACK_MINUTES * MIN,
          emergency ? 1 : 0,
          now,
          job.version,
          job.id,
        ),
      eventStatement(db, {
        ...sys,
        kind: 'assigned',
        partnerId: target.id,
        data: { reason: 'partner_suspended' },
      }),
      audit(db, now, 'job_reassigned', 'request', job.id, { reason: 'partner_suspended' }),
    ];
    if (emergency) {
      statements.push(
        notificationStatement(db, {
          ...sys,
          to: { kind: 'partner', partnerId: target.id },
          template: 'emergency_new_job',
          urgent: true,
        }),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'user', userId: job.owner_user_id },
          template: 'emergency_owner_update',
          urgent: false,
        }),
      );
    }
    try {
      await db.batch(statements);
      moved += 1;
    } catch (err) {
      if (!isVersionConflict(err)) throw err;
      log.log('info', 'Job changed while moving it; the next run retries', { requestId: job.id });
    }
  }
  return moved;
}

async function setStanding(
  db: D1Database,
  now: number,
  partnerId: string,
  change: 'suspend' | 'reinstate',
  c: Compliance,
) {
  const reason = suspensionReason(c);
  await db.batch([
    change === 'suspend'
      ? db
          .prepare(
            `UPDATE partners SET status = 'suspended', status_reason = ?, suspended_by = 'compliance',
               updated_at = MAX(updated_at, ?) WHERE id = ? AND status = 'active'`,
          )
          .bind(reason, now, partnerId)
      : db
          .prepare(
            `UPDATE partners SET status = 'active', status_reason = NULL, suspended_by = NULL,
               updated_at = MAX(updated_at, ?) WHERE id = ? AND status = 'suspended' AND suspended_by = 'compliance'`,
          )
          .bind(now, partnerId),
    audit(db, now, change === 'suspend' ? 'partner_suspended' : 'partner_reinstated', 'partner', partnerId, {
      licence: c.licence,
      insurance: c.insurance,
    }),
  ]);
}

async function scorecardFlags(db: D1Database, now: number, partnerId: string) {
  const ratings = await db
    .prepare('SELECT at, stars FROM ratings WHERE partner_id = ? AND at > ?')
    .bind(partnerId, now - RATING_WINDOW_DAYS * DAY)
    .all<{ at: number; stars: number }>();
  const missed = await db
    .prepare(
      `SELECT recorded_at AS at FROM sla_outcomes WHERE partner_id = ? AND outcome = 'missed'
       AND metric IN ('emergency_ack', 'emergency_on_site') AND recorded_at > ?`,
    )
    .bind(partnerId, now - MISSED_EMERGENCY_WINDOW_DAYS * DAY)
    .all<{ at: number }>();
  const breaches = await db
    .prepare(
      `SELECT kind, at FROM partner_incidents WHERE partner_id = ? AND resolved_at IS NULL
       AND kind IN ('safety_breach', 'honesty_breach')`,
    )
    .bind(partnerId)
    .all<{ kind: 'safety_breach' | 'honesty_breach'; at: number }>();
  return reviewFlags(
    {
      ratings: ratings.results,
      missedEmergencies: missed.results.map((m) => m.at),
      breaches: breaches.results,
    },
    now,
  );
}

export async function runPartnerReview(
  db: D1Database,
  now: number,
  log: Logger,
): Promise<PartnerReviewResult> {
  const today = dubaiDate(now);
  const { results: partners } = await db
    .prepare("SELECT id, status, suspended_by FROM partners WHERE status IN ('active', 'suspended')")
    .all<PartnerRow>();
  const totals = { partners: partners.length, suspended: 0, reinstated: 0, jobsMoved: 0, itemsOpened: 0 };
  const item = async (partnerId: string, kind: ReviewKind, key: string, detail: Detail) => {
    if (await openItem(db, now, partnerId, kind, key, detail)) totals.itemsOpened += 1;
  };

  for (const p of partners) {
    const docs = await latestDocuments(db, p.id);
    const c = partnerCompliance(docs, today);
    const change = complianceChange({ status: p.status, suspendedBy: p.suspended_by }, c);
    if (change !== null) {
      await setStanding(db, now, p.id, change, c);
      totals[change === 'suspend' ? 'suspended' : 'reinstated'] += 1;
    }
    if (change === 'suspend') {
      await item(p.id, 'suspended', 'suspended', { reason: suspensionReason(c) });
    }
    if (change === 'suspend' || (p.status === 'suspended' && change === null)) {
      totals.jobsMoved += await moveWaitingJobs(db, now, p.id, log);
      const left = await db
        .prepare(
          `SELECT count(*) AS n FROM requests WHERE partner_id = ?
           AND status NOT IN ('assigned', 'closed', 'cancelled')`,
        )
        .bind(p.id)
        .first<{ n: number }>();
      if (left !== null && left.n > 0) await item(p.id, 'open_jobs', 'open_jobs', { jobs: left.n });
    }
    for (const doc of ['licence', 'insurance'] as const) {
      const expiresOn = docs[doc];
      if (c[doc] === 'expiring_soon' && expiresOn !== null) {
        await item(p.id, 'document_expiring', `document_expiring:${doc}:${expiresOn}`, {
          document: doc,
          expiresOn,
        });
      }
    }
    for (const flag of await scorecardFlags(db, now, p.id)) {
      const kind = flag.kind === 'breach' ? flag.breach : flag.kind;
      const detail: Detail =
        flag.kind === 'low_rating'
          ? { average: Math.round(flag.average * 100) / 100, ratings: flag.ratings }
          : flag.kind === 'missed_emergencies'
            ? { missed: flag.count }
            : {};
      await item(p.id, kind, reviewKey(flag), detail);
    }
  }

  log.log('info', 'Daily partner review', { ...totals });
  return totals;
}
