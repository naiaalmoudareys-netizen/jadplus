/**
 * Emergency rules from the master plan (BUILD_SPEC E1-E8, E12-E15, L3; Q&A 2-4).
 * The app never gives instructions (L3): only the exact texts below are shown.
 */

/** What counts as an emergency (Q&A 2). */
export const EMERGENCY_TYPES = [
  'water_leak',
  'no_power',
  'ac_failure',
  'lockout',
  'door_window_wont_lock',
] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

/**
 * What owners and tenants can report as an emergency in JAD+ (Naya, 10-Nov-2026: "our emergencies are water
 * leak and AC not working"; ADR 0017). The other types stay above so older requests keep their meaning.
 */
export const RAISABLE_EMERGENCY_TYPES = [
  'water_leak',
  'ac_failure',
] as const satisfies readonly EmergencyType[];
export type RaisableEmergencyType = (typeof RAISABLE_EMERGENCY_TYPES)[number];

/**
 * Life-safety situations (E3). No longer reported through JAD+ (ADR 0017: the app is not an emergency service;
 * the terms and the L3 text point to 999); kept so older requests keep their meaning.
 */
export const LIFE_SAFETY_TYPES = ['fire', 'smoke', 'gas_smell', 'injury'] as const;
export type LifeSafetyType = (typeof LIFE_SAFETY_TYPES)[number];

/** Escalation timings in minutes (E4-E6, decision 3). */
export const EMERGENCY_ACK_MINUTES = 15;
export const EMERGENCY_BACKUP_MINUTES = 30;
/** Proposed emergency on-site target (p.10): 2 hours, 24/7. */
export const EMERGENCY_ON_SITE_MINUTES = 120;

/** AC failure counts as an emergency from May to October (E14, Q&A 2). Month is 1-12 in Dubai time. */
export function isAcEmergencySeason(dubaiMonth: number): boolean {
  return dubaiMonth >= 5 && dubaiMonth <= 10;
}

/** Whether an emergency type qualifies as an emergency at the given Dubai month. */
export function qualifiesAsEmergency(type: EmergencyType, dubaiMonth: number): boolean {
  return type !== 'ac_failure' || isAcEmergencySeason(dubaiMonth);
}

/**
 * The ONLY confirmation text shown after an emergency is raised (L3, p.12-13).
 * No instructions about water, power, gas or anything else.
 */
export function emergencyConfirmationText(providerName: string): string {
  return `Your emergency has been sent to ${providerName}. If anyone is in danger, call 999.`;
}

/** Text the owner receives when a tenant raises an emergency (E1, p.13 step 2). */
export const OWNER_EMERGENCY_NOTICE =
  'Emergency reported at your unit. Our maintenance partner has been dispatched. No action is needed from you now.';

export type EscalationStep = 'none' | 'remind_primary' | 'move_to_backup';

/**
 * Where an unacknowledged emergency stands `minutesSinceRaised` after it was raised (E5, E6).
 * Acknowledged emergencies never escalate.
 */
export function emergencyEscalation(minutesSinceRaised: number, acknowledged: boolean): EscalationStep {
  if (acknowledged) return 'none';
  if (minutesSinceRaised >= EMERGENCY_BACKUP_MINUTES) return 'move_to_backup';
  if (minutesSinceRaised >= EMERGENCY_ACK_MINUTES) return 'remind_primary';
  return 'none';
}

/** Where the water / fault comes from decides who acts (E12). */
export type FaultSource = 'unit' | 'building' | 'neighbour' | 'fire_system';

/** Who is dispatched for a fault source: building FM for shared parts, partner only makes the unit safe. */
export function dispatchFor(source: FaultSource): { partner: boolean; buildingFm: boolean } {
  switch (source) {
    case 'unit':
      return { partner: true, buildingFm: false };
    case 'building':
    case 'neighbour':
      return { partner: true, buildingFm: true };
    case 'fire_system':
      return { partner: false, buildingFm: true };
  }
}

const MINUTE_MS = 60_000;

/** E4 arrival window rules (ADR 0004): up to 4 hours long, starting within the next 24 hours. */
export const ARRIVAL_WINDOW_MAX_MINUTES = 240;
export const ARRIVAL_START_MAX_AHEAD_MINUTES = 24 * 60;
/** Allowance for a phone clock a little behind the server's. */
export const ARRIVAL_CLOCK_SKEW_MINUTES = 5;

/** E4: whether an arrival window a partner gives is acceptable at `now` (all UTC ms). */
export function arrivalWindowAllowed(start: number, end: number, now: number): boolean {
  return (
    start >= now - ARRIVAL_CLOCK_SKEW_MINUTES * MINUTE_MS &&
    end > start &&
    end - start <= ARRIVAL_WINDOW_MAX_MINUTES * MINUTE_MS &&
    start <= now + ARRIVAL_START_MAX_AHEAD_MINUTES * MINUTE_MS
  );
}

/**
 * E4: the arrival windows the app offers, so a technician picks one tap instead of typing times.
 * Each starts at `now` rounded up to the next 5 minutes; all satisfy arrivalWindowAllowed.
 */
export function arrivalChoices(now: number): readonly { label: string; start: number; end: number }[] {
  const step = 5 * MINUTE_MS;
  const base = Math.ceil(now / step) * step;
  const at = (minutes: number) => base + minutes * MINUTE_MS;
  return [
    { label: 'Within 1 hour', start: at(0), end: at(60) },
    { label: 'In 1 to 2 hours', start: at(60), end: at(120) },
    { label: 'In 2 to 4 hours', start: at(120), end: at(240) },
  ];
}
