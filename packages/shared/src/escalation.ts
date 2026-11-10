/**
 * Escalation of an unacknowledged emergency (BUILD_SPEC E4-E7; plan p.13 steps 3-5).
 *
 *  0 min   raised: primary partner alerted at once (E1)
 * 15 min   not acknowledged: reminder to the primary (E5)
 * 30 min   still not acknowledged: job moves to the backup partner, on-call phone alerted (E6)
 * +15 min  backup has not acknowledged either: on-call calls both partners and building FM (E7)
 *
 * The backup gets the same 15-minute acknowledgement window as the primary (ADR 0004). With no active
 * backup, the 30-minute step goes straight to on-call. Once a partner acknowledges, nothing escalates.
 * Called by the scheduled sweep every minute; a missed sweep catches up to the right step.
 */
import { EMERGENCY_ACK_MINUTES, EMERGENCY_BACKUP_MINUTES } from './emergency.js';

/** Mirrors the requests.escalation CHECK list in apps/api/migrations/0005_requests.sql. */
export const ESCALATION_STAGES = ['none', 'reminded', 'moved_to_backup', 'on_call'] as const;
export type EscalationStage = (typeof ESCALATION_STAGES)[number];

export type EscalationAction = 'remind_primary' | 'move_to_backup' | 'call_on_call';

/** How long the backup partner has to acknowledge before on-call takes over (E7). */
export const BACKUP_ACK_MINUTES = EMERGENCY_ACK_MINUTES;

export interface EmergencyClock {
  readonly raisedAt: number;
  readonly stage: EscalationStage;
  /** When the job moved to the backup partner (stage moved_to_backup). */
  readonly movedToBackupAt: number | null;
  readonly acknowledged: boolean;
  /** Whether an active backup partner exists for the service right now. */
  readonly backupAvailable: boolean;
}

const MIN = 60_000;

/** The single next action due now, or null if nothing is due. */
export function nextEscalation(e: EmergencyClock, now: number): EscalationAction | null {
  if (e.acknowledged) return null;
  const sinceRaised = now - e.raisedAt;
  switch (e.stage) {
    case 'none':
    case 'reminded':
      if (sinceRaised >= EMERGENCY_BACKUP_MINUTES * MIN) {
        return e.backupAvailable ? 'move_to_backup' : 'call_on_call';
      }
      return e.stage === 'none' && sinceRaised >= EMERGENCY_ACK_MINUTES * MIN ? 'remind_primary' : null;
    case 'moved_to_backup':
      return now - (e.movedToBackupAt ?? e.raisedAt) >= BACKUP_ACK_MINUTES * MIN ? 'call_on_call' : null;
    case 'on_call':
      return null;
  }
}

export function stageAfter(action: EscalationAction): EscalationStage {
  switch (action) {
    case 'remind_primary':
      return 'reminded';
    case 'move_to_backup':
      return 'moved_to_backup';
    case 'call_on_call':
      return 'on_call';
  }
}

/** A partner as far as dispatch is concerned. */
export interface DispatchPartner {
  readonly id: string;
  readonly status: 'active' | 'suspended' | 'ended';
}

/**
 * Who gets a new job (S3, S7, P3, P4): the primary when active, otherwise the backup when active.
 * Null means the service has no partner able to take work (S2: shown as "coming soon").
 */
export function choosePartner<P extends DispatchPartner>(primary: P | null, backup: P | null): P | null {
  if (primary?.status === 'active') return primary;
  if (backup?.status === 'active') return backup;
  return null;
}

/** E8: make-safe work goes ahead without a quote only within the owner's pre-authorised cap. */
export function makeSafeWithinCap(amountFils: number, capFils: number | null): boolean {
  return capFils !== null && amountFils > 0 && amountFils <= capFils;
}
