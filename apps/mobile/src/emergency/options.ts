/**
 * What a resident can report as an emergency (E2, E3, E12, E14) and how it is worded on screen, in the
 * person's language (ADR 0016). The app gives no instructions (L3): it only asks what is happening and where,
 * then shows the API's exact confirmation.
 */
import {
  EMERGENCY_TYPES,
  LIFE_SAFETY_TYPES,
  type EmergencyType,
  type FaultSource,
  type LifeSafetyType,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { translator, type Translate } from '../i18n/lang.js';
import { emergencyTypeLabel } from '../i18n/sharedLabels.js';

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** On the report screen an injury reads "Someone is injured"; the other kinds use their usual name. */
function lifeSafetyLabel(value: LifeSafetyType, t: Translate): string {
  return value === 'injury' ? t('emergency.someoneInjured') : emergencyTypeLabel(value, t);
}

/** E3: shown first and in red; choosing one shows only the emergency numbers. */
export function lifeSafetyOptions(t: Translate): readonly Option<LifeSafetyType>[] {
  return LIFE_SAFETY_TYPES.map((value) => ({ value, label: lifeSafetyLabel(value, t) }));
}

const english = translator('en');

/** E3: what JAD+ is told when someone reports fire, smoke, gas or injury: always English, for the team. */
export function lifeSafetyReport(value: LifeSafetyType): string {
  return lifeSafetyLabel(value, english);
}

/** E2: the emergencies a technician is sent for. AC failure counts May-October only (E14, checked by the API). */
export function emergencyOptions(t: Translate): readonly Option<EmergencyType>[] {
  return EMERGENCY_TYPES.map((value) => ({ value, label: emergencyTypeLabel(value, t) }));
}

const SOURCE_KEYS: readonly { readonly value: FaultSource; readonly key: MessageKey }[] = [
  { value: 'unit', key: 'emergency.source.unit' },
  { value: 'building', key: 'emergency.source.building' },
  { value: 'neighbour', key: 'emergency.source.neighbour' },
  { value: 'fire_system', key: 'emergency.source.fire_system' },
];

/** E12: where water comes from decides who acts, so it is asked for leaks only. */
export function faultSourceOptions(t: Translate): readonly Option<FaultSource>[] {
  return SOURCE_KEYS.map(({ value, key }) => ({ value, label: t(key) }));
}

export function asksWhereFrom(type: EmergencyType): boolean {
  return type === 'water_leak';
}

/** Phone link for an emergency number (opens the dialler; the person presses call). */
export function callLink(number: string): string {
  if (!/^\d{3}$/.test(number)) throw new Error('Not an emergency number');
  return `tel:${number}`;
}
