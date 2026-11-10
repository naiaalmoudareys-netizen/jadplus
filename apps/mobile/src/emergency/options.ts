/**
 * What a resident can report as an emergency (E2, E12, E14; ADR 0017: water leak or AC failure) and how it is worded on screen, in the
 * person's language (ADR 0016). The app gives no instructions (L3): it only asks what is happening and where,
 * then shows the API's exact confirmation.
 */
import { RAISABLE_EMERGENCY_TYPES, type FaultSource, type RaisableEmergencyType } from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Translate } from '../i18n/lang.js';
import { emergencyTypeLabel } from '../i18n/sharedLabels.js';

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** The emergencies a technician is sent for (ADR 0017). AC failure counts May-October only (E14, checked by the API). */
export function emergencyOptions(t: Translate): readonly Option<RaisableEmergencyType>[] {
  return RAISABLE_EMERGENCY_TYPES.map((value) => ({ value, label: emergencyTypeLabel(value, t) }));
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

export function asksWhereFrom(type: RaisableEmergencyType): boolean {
  return type === 'water_leak';
}
