/**
 * What a resident can report as an emergency (E2, E3, E12, E14) and how it is worded on screen. The app gives
 * no instructions (L3): it only asks what is happening and where, then shows the API's exact confirmation.
 */
import {
  EMERGENCY_TYPES,
  EMERGENCY_TYPE_LABELS,
  LIFE_SAFETY_TYPES,
  type EmergencyType,
  type FaultSource,
  type LifeSafetyType,
} from '@jadplus/shared';

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

const LIFE_SAFETY_LABELS: Readonly<Record<LifeSafetyType, string>> = {
  fire: 'Fire',
  smoke: 'Smoke',
  gas_smell: 'Gas smell',
  injury: 'Someone is injured',
};

/** E3: shown first and in red; choosing one shows only the emergency numbers. */
export const LIFE_SAFETY_OPTIONS: readonly Option<LifeSafetyType>[] = LIFE_SAFETY_TYPES.map((value) => ({
  value,
  label: LIFE_SAFETY_LABELS[value],
}));

/** E2: the emergencies a technician is sent for. AC failure counts May-October only (E14, checked by the API). */
export const EMERGENCY_OPTIONS: readonly Option<EmergencyType>[] = EMERGENCY_TYPES.map((value) => ({
  value,
  label: EMERGENCY_TYPE_LABELS[value],
}));

/** E12: where water comes from decides who acts, so it is asked for leaks only. */
export const FAULT_SOURCE_OPTIONS: readonly Option<FaultSource>[] = [
  { value: 'unit', label: 'Inside my home' },
  { value: 'building', label: 'Shared pipes, roof or corridor' },
  { value: 'neighbour', label: 'From a neighbour' },
  { value: 'fire_system', label: 'Fire sprinkler' },
];

export function asksWhereFrom(type: EmergencyType): boolean {
  return type === 'water_leak';
}

/** Phone link for an emergency number (opens the dialler; the person presses call). */
export function callLink(number: string): string {
  if (!/^\d{3}$/.test(number)) throw new Error('Not an emergency number');
  return `tel:${number}`;
}
