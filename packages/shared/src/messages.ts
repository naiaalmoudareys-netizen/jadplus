/**
 * Alert messages and how they are delivered (BUILD_SPEC E1, E4-E7, E12, L3; ADR 0007).
 *
 * Messages carry the request reference and the kind of emergency only: never a name, address, phone or
 * description, because SMS and email pass through outside providers. The recipient opens JAD+ for details.
 * The owner notice is the plan's exact text (E1). Nothing here gives the resident instructions (L3).
 */
import { OWNER_EMERGENCY_NOTICE, type EmergencyType, type LifeSafetyType } from './emergency.js';

export const NOTIFICATION_TEMPLATES = [
  'emergency_new_job',
  'emergency_owner_notice',
  'emergency_reminder',
  'emergency_backup_alert',
  'emergency_on_call',
  'emergency_life_safety',
  'emergency_acknowledged',
  'emergency_owner_update',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export const RECIPIENT_KINDS = ['user', 'partner', 'on_call', 'building_fm'] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

/** Delivery channels. Each is connected to a provider separately (ADR 0007); push comes with the app. */
export const CHANNELS = ['sms', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

const TYPE_LABEL: Readonly<Record<EmergencyType | LifeSafetyType, string>> = {
  water_leak: 'Water leak',
  no_power: 'No power',
  ac_failure: 'AC failure',
  lockout: 'Locked out',
  door_window_wont_lock: "Door or window won't lock",
  fire: 'Fire',
  smoke: 'Smoke',
  gas_smell: 'Gas smell',
  injury: 'Injury',
};

const DUBAI_OFFSET_MS = 4 * 3_600_000;

/** "HH:MM" in Dubai time (UTC+4, no daylight saving). */
export function dubaiClock(t: number): string {
  return new Date(t + DUBAI_OFFSET_MS).toISOString().slice(11, 16);
}

export interface MessageFacts {
  readonly ref: string;
  readonly type: EmergencyType | LifeSafetyType | null;
  /** Arrival window promised by the partner (E4), as Dubai "HH:MM" times. */
  readonly arrival: { readonly from: string; readonly to: string } | null;
}

export interface Message {
  /** Email subject; also the start of the SMS. */
  readonly subject: string;
  readonly body: string;
}

/** The text of one alert. Short enough for two SMS segments. */
export function renderMessage(template: NotificationTemplate, to: RecipientKind, f: MessageFacts): Message {
  const what = f.type === null ? 'Emergency' : TYPE_LABEL[f.type];
  switch (template) {
    case 'emergency_new_job':
      return {
        subject: `JAD+ EMERGENCY ${f.ref}`,
        body: `${what}. New emergency job for you. Open JAD+ and acknowledge within 15 minutes.`,
      };
    case 'emergency_reminder':
      return {
        subject: `JAD+ REMINDER ${f.ref}`,
        body: `${what}. Not acknowledged yet. Acknowledge now or the job moves to the backup partner.`,
      };
    case 'emergency_backup_alert':
      return {
        subject: `JAD+ ON-CALL ${f.ref}`,
        body: `${what}. The primary partner did not acknowledge; the job moved to the backup partner. Please follow up in JAD+.`,
      };
    case 'emergency_on_call':
      return to === 'building_fm'
        ? {
            subject: `JAD+ BUILDING ALERT ${f.ref}`,
            body: `${what} reported. No partner has acknowledged yet; the JAD+ on-call team is handling it and may call you.`,
          }
        : {
            subject: `JAD+ ON-CALL NOW ${f.ref}`,
            body: `${what}. No partner has acknowledged. Call both partners and building management now.`,
          };
    case 'emergency_life_safety':
      return {
        subject: `JAD+ LIFE SAFETY ${f.ref}`,
        body: `${what} reported by a resident. They were shown the emergency numbers 999, 997 and 998. Check on them now.`,
      };
    case 'emergency_owner_notice':
      return { subject: `JAD+ ${f.ref}`, body: OWNER_EMERGENCY_NOTICE };
    case 'emergency_acknowledged':
      return {
        subject: `JAD+ ${f.ref}`,
        body:
          f.arrival === null
            ? 'Your emergency has been acknowledged. Open JAD+ to see who is coming.'
            : `Your emergency has been acknowledged. A technician will arrive between ${f.arrival.from} and ${f.arrival.to}.`,
      };
    case 'emergency_owner_update':
      return {
        subject: `JAD+ ${f.ref}`,
        body: 'There is an update on the emergency at your unit. Open JAD+ to see it.',
      };
  }
}

/**
 * Which channels an alert goes out on. Urgent alerts must wake someone up, so they go by SMS AND email; other
 * messages to residents go by email (WhatsApp and app push join when connected, ADR 0007).
 */
export function channelsFor(urgent: boolean): readonly Channel[] {
  return urgent ? ['sms', 'email'] : ['email'];
}

/** Minutes to wait before each retry. Urgent alerts retry fast; the last entry is the final attempt. */
const RETRY_MINUTES = { urgent: [1, 2, 5, 10], normal: [5, 30, 120, 720] } as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_MINUTES.urgent.length + 1;

/**
 * When to try again after `attempts` failed tries (1 = the first try failed), or null when it has failed
 * for good and must be shown to JAD+ Admin.
 */
export function nextAttemptAt(attempts: number, urgent: boolean, now: number): number | null {
  const waits = urgent ? RETRY_MINUTES.urgent : RETRY_MINUTES.normal;
  const wait = waits[attempts - 1];
  return wait === undefined ? null : now + wait * 60_000;
}
