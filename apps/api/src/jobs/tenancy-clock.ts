/**
 * Tenancy and approval clock (ADR 0021), run every minute with the request clock; each step happens once:
 *
 * - U4: 30 days before a tenancy ends, the tenant and the owner are told (once per end date, so an extension
 *   warns again before the new end).
 * - U4/U5: the day after the end date the tenancy is marked ended (access already stopped at midnight, by the
 *   date check) and both are told; the owner can extend it in one tap.
 * - A1: a tenant's request still waiting for the owner after 24 hours: the owner is reminded. JAD+ calls the
 *   owner at 48 hours (admin console).
 */
import {
  APPROVAL_REMINDER_HOURS,
  TENANCY_WARNING_DAYS,
  addDays,
  daysBetween,
  dubaiDate,
} from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { managedNowSql } from '../managed/store.js';
import { inboxStatements, tenancyInboxStatement, type InboxTarget } from '../requests/inbox.js';

const HOUR = 3_600_000;

interface TenancyDue {
  id: string;
  owner_user_id: string;
  tenant_user_id: string;
  ends_on: string;
}

export interface TenancyClockResult {
  readonly warned: number;
  readonly ended: number;
  readonly approvalReminders: number;
}

async function warnEnding(db: D1Database, now: number, today: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, owner_user_id, tenant_user_id, ends_on FROM tenancies
       WHERE status = 'active' AND ends_on >= ? AND ends_on <= ?
         AND NOT EXISTS (SELECT 1 FROM inbox
           WHERE dedupe_key = 'tenancy_ending:' || tenancies.id || ':' || ends_on || ':' || tenant_user_id)`,
    )
    .bind(today, addDays(today, TENANCY_WARNING_DAYS))
    .all<TenancyDue>();
  for (const t of results) {
    const days = daysBetween(today, t.ends_on);
    const item = (userId: string) =>
      tenancyInboxStatement(db, {
        tenancyId: t.id,
        userId,
        kind: 'tenancy_ending',
        at: now,
        data: { endsOn: t.ends_on, days },
        dedupeKey: `tenancy_ending:${t.id}:${t.ends_on}`,
      });
    await db.batch([item(t.tenant_user_id), item(t.owner_user_id)]);
  }
  return results.length;
}

async function markEnded(db: D1Database, now: number, today: string): Promise<number> {
  const { results } = await db
    .prepare(
      "SELECT id, owner_user_id, tenant_user_id, ends_on FROM tenancies WHERE status = 'active' AND ends_on < ?",
    )
    .bind(today)
    .all<TenancyDue>();
  for (const t of results) {
    const item = (userId: string) =>
      tenancyInboxStatement(db, {
        tenancyId: t.id,
        userId,
        kind: 'tenancy_ended',
        at: now,
        data: { endsOn: t.ends_on },
        dedupeKey: `tenancy_ended:${t.id}:${t.ends_on}`,
      });
    await db.batch([
      db
        .prepare("UPDATE tenancies SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'")
        .bind(now, t.id),
      item(t.tenant_user_id),
      item(t.owner_user_id),
      auditStatement(db, {
        at: now,
        actorUserId: null,
        actorRole: 'system',
        action: 'tenancy_expired',
        targetType: 'tenancy',
        targetId: t.id,
        ipHash: null,
        httpRequestId: null,
      }),
    ]);
  }
  return results.length;
}

async function approvalReminders(db: D1Database, now: number, today: string): Promise<number> {
  // ADR 0034: on a managed unit the managing team decides, so the owner is not reminded.
  const { results } = await db
    .prepare(
      `SELECT id, owner_user_id, raised_by_user_id FROM requests
       WHERE status = 'awaiting_owner' AND created_at + ?1 <= ?2
         AND NOT EXISTS (SELECT 1 FROM inbox
           WHERE dedupe_key = 'approval_reminder:' || requests.id || ':' || owner_user_id)
         AND NOT EXISTS (SELECT 1 FROM managed_units m
           WHERE m.sf_unit_id = requests.sf_unit_id AND ${managedNowSql('m', '?3')})`,
    )
    .bind(APPROVAL_REMINDER_HOURS * HOUR, now, today)
    .all<InboxTarget>();
  for (const r of results) {
    await db.batch(inboxStatements(db, r, 'approval_reminder', now, {}, `approval_reminder:${r.id}`));
  }
  return results.length;
}

export async function runTenancyClock(db: D1Database, now: number): Promise<TenancyClockResult> {
  const today = dubaiDate(now);
  return {
    warned: await warnEnding(db, now, today),
    ended: await markEnded(db, now, today),
    approvalReminders: await approvalReminders(db, now, today),
  };
}
