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

/** Life-safety situations go to emergency services first; no technician is sent (E3). */
export const LIFE_SAFETY_TYPES = ['fire', 'smoke', 'gas_smell', 'injury'] as const;
export type LifeSafetyType = (typeof LIFE_SAFETY_TYPES)[number];

/** E3: fire, smoke, gas or injury — emergency services first, no technician. */
export function isLifeSafety(type: EmergencyType | LifeSafetyType): type is LifeSafetyType {
  return (LIFE_SAFETY_TYPES as readonly string[]).includes(type);
}

export const EMERGENCY_NUMBERS = [
  { number: '999', label: 'Police' },
  { number: '997', label: 'Civil Defence' },
  { number: '998', label: 'Ambulance' },
] as const;

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
