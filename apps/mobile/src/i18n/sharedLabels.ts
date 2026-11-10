/**
 * packages/shared's labels in the person's language (ADR 0016). packages/shared keeps its English (the API,
 * SMS and email use it); the app looks each one up by its code here. A code the app does not know yet (a new
 * service added on the server) shows the server's English rather than nothing.
 */
import {
  SERVICES,
  type DeskRequestType,
  type EmergencyType,
  type Instalment,
  type InstalmentState,
  type LifeSafetyType,
  type ServiceGroup,
  type VisitSlot,
} from '@jadplus/shared';
import type { MessageKey } from './dictionary.js';
import { isMessageKey, type Translate } from './lang.js';

/** A service's name by its code ("maintenance"), or `fallback` (the API's English) for an unknown code. */
export function serviceName(code: string, fallback: string, t: Translate): string {
  const key = `service.${code}.name`;
  return isMessageKey(key) ? t(key) : fallback;
}

/** A service's one-line description by its code, or `fallback` for an unknown code. */
export function serviceBlurb(code: string, fallback: string, t: Translate): string {
  const key = `service.${code}.blurb`;
  return isMessageKey(key) ? t(key) : fallback;
}

/**
 * A service named by its English name (requests and jobs carry the name, not the code): translated when it
 * is one of the catalogue's, otherwise shown as the API gave it.
 */
export function serviceNameFromEnglish(name: string, t: Translate): string {
  const service = SERVICES.find((s) => s.name === name);
  return service === undefined ? name : serviceName(service.code, name, t);
}

const GROUP_KEYS: Readonly<Record<ServiceGroup, MessageKey>> = {
  'Property care': 'serviceGroup.propertyCare',
  'Investment services': 'serviceGroup.investment',
  Lifestyle: 'serviceGroup.lifestyle',
};

export function serviceGroupLabel(group: ServiceGroup, t: Translate): string {
  return t(GROUP_KEYS[group]);
}

const SLOT_KEYS: Readonly<Record<VisitSlot, MessageKey>> = {
  morning: 'visit.morning',
  midday: 'visit.midday',
  afternoon: 'visit.afternoon',
};

/** "Morning" (ADR 0013). The hours ("9:00 - 12:00") are the same in every language. */
export function visitSlotLabel(slot: VisitSlot, t: Translate): string {
  return t(SLOT_KEYS[slot]);
}

/** "Morning (9:00 - 12:00)". */
export function visitSlotText(
  slot: { readonly key: VisitSlot; readonly hours: string },
  t: Translate,
): string {
  return t('visit.slot', { label: visitSlotLabel(slot.key, t), hours: slot.hours });
}

const EMERGENCY_KEYS: Readonly<Record<EmergencyType | LifeSafetyType, MessageKey>> = {
  water_leak: 'emergency.type.water_leak',
  no_power: 'emergency.type.no_power',
  ac_failure: 'emergency.type.ac_failure',
  lockout: 'emergency.type.lockout',
  door_window_wont_lock: 'emergency.type.door_window_wont_lock',
  fire: 'emergency.type.fire',
  smoke: 'emergency.type.smoke',
  gas_smell: 'emergency.type.gas_smell',
  injury: 'emergency.type.injury',
};

/** "Water leak" (E2, E3). */
export function emergencyTypeLabel(type: EmergencyType | LifeSafetyType, t: Translate): string {
  return t(EMERGENCY_KEYS[type]);
}

const ARRIVAL_KEYS: readonly MessageKey[] = ['arrival.within1h', 'arrival.in1to2h', 'arrival.in2to4h'];

/** E4: the label of arrivalChoices(now)[index] ("Within 1 hour"); `fallback` past the known choices. */
export function arrivalChoiceLabel(index: number, fallback: string, t: Translate): string {
  const key = ARRIVAL_KEYS[index];
  return key === undefined ? fallback : t(key);
}

const DESK_KEYS: Readonly<Record<DeskRequestType, string>> = {
  'Reservation Form': 'reservationForm',
  SPA: 'spa',
  'Stamped Statement of Account': 'statement',
  NOC: 'noc',
  'Oqood or Title Deed copy': 'titleDeed',
  'Update my contact details': 'contact',
  'Close my JAD+ account': 'close',
  Other: 'other',
};

/** A JAD+ desk request type ("SPA"), as listed under Documents and in Profile (ADR 0011). */
export function deskTypeLabel(type: DeskRequestType, t: Translate): string {
  const key = `desk.type.${DESK_KEYS[type]}`;
  return isMessageKey(key) ? t(key) : type;
}

/** The plain explanation next to a desk request type. */
export function deskHint(type: DeskRequestType, t: Translate): string {
  const key = `desk.hint.${DESK_KEYS[type]}`;
  return isMessageKey(key) ? t(key) : type;
}

const DAY_MS = 86_400_000;

/**
 * R1/O1: an instalment's state (from packages/shared instalmentState) in the person's language. The day
 * count is worked out again here because the shared state carries it only inside its English label.
 */
export function instalmentLabel(
  instalment: Instalment,
  state: InstalmentState,
  today: string,
  t: Translate,
): string {
  const days =
    instalment.due === null
      ? 0
      : Math.round((Date.parse(`${instalment.due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  const form = (n: number): 'one' | 'other' => (n === 1 ? 'one' : 'other');
  switch (state.kind) {
    case 'paid':
      return t('instalment.paid');
    case 'later':
      return t(state.label === 'On completion' ? 'instalment.onCompletion' : 'instalment.scheduled');
    case 'overdue':
      return t(`instalment.overdue.${form(-days)}`, { count: -days });
    case 'soon':
      return days === 0 ? t('instalment.dueToday') : t(`instalment.dueIn.${form(days)}`, { count: days });
    case 'part':
      return t('instalment.partPaid');
    case 'upcoming':
      return t('instalment.upcoming');
  }
}
