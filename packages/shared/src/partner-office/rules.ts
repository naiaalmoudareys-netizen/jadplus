/**
 * Partner office company tools (ADR 0025): the pure rules behind the office's overview, dispatch, documents,
 * rate card, after-hours weeks, scorecard and export.
 */
import type { EmergencyType } from '../emergency.js';
import {
  LOW_RATING_AVERAGE,
  MISSED_EMERGENCY_LIMIT,
  MISSED_EMERGENCY_WINDOW_DAYS,
  RATING_WINDOW_DAYS,
  documentStanding,
  reviewFlags,
  type DocumentStanding,
  type ScorecardFacts,
} from '../scorecard.js';
import { addDays, daysBetween } from '../tenancy.js';

const DAY = 86_400_000;
const DUBAI_OFFSET = 4 * 3_600_000;

/** The fixed list of technician skills used for dispatch suggestions. */
export const SKILLS = [
  'ac',
  'plumbing',
  'electrical',
  'carpentry',
  'painting',
  'appliances',
  'general',
] as const;
export type Skill = (typeof SKILLS)[number];

/** Why a technician is away. Mirrors the CHECK list in migration 0021. */
export const UNAVAILABLE_REASONS = ['leave', 'sick', 'training', 'other'] as const;

/** Contract documents (S10). Mirrors partner_documents.kind in migration 0003. */
export const PARTNER_DOCUMENT_KINDS = [
  'trade_licence',
  'insurance',
  'signed_sop_sla_kpi',
  'rate_card',
] as const;
export type PartnerDocumentKind = (typeof PARTNER_DOCUMENT_KINDS)[number];

/** Quote statuses (A2, A3). Mirrors quotes.status in migration 0005. */
export const QUOTE_STATUSES_FOR_OFFICE = ['pending', 'approved', 'declined', 'expired', 'withdrawn'] as const;

/** A licence and an insurance always carry an expiry date (S7); the other documents may. */
export function expiryRequired(kind: PartnerDocumentKind): boolean {
  return kind === 'trade_licence' || kind === 'insurance';
}

/** Largest contract PDF accepted (matches the attachments PDF limit in migration 0005). */
export const PARTNER_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

/** A PDF is recognised by its own first bytes ("%PDF-"), never by its name or declared type. */
export function isPdf(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length > magic.length && magic.every((b, i) => bytes[i] === b);
}

/**
 * S7/S10: where a document stands. A document on file without an expiry date (e.g. the signed SOP) is valid;
 * one with a date follows the 30-day warning and lapse rule.
 */
export function partnerDocumentStanding(
  doc: { readonly expiresOn: string | null } | null,
  today: string,
): DocumentStanding {
  if (doc === null) return 'missing';
  return doc.expiresOn === null ? 'valid' : documentStanding(doc.expiresOn, today);
}

/** S9/P1: a price change takes effect at least 60 days after it is sent. */
export const RATE_CHANGE_NOTICE_DAYS = 60;
/** S9: a rate card is fixed for 12 months. */
export const RATE_CARD_VALID_MONTHS = 12;

/** Last day a rate card starting on `effectiveFrom` is valid: 12 months on, less one day. */
export function rateCardValidUntil(effectiveFrom: string): string {
  const d = new Date(`${effectiveFrom}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + RATE_CARD_VALID_MONTHS);
  // 29 Feb + 12 months rolls into March: fall back to the last day of February.
  if (d.getUTCDate() !== Number(effectiveFrom.slice(8, 10))) d.setUTCDate(0);
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** AED amount (up to 2 decimals) to fils, the integer unit money is stored in. */
export function aedToFils(aed: number): number {
  return Math.round(aed * 100);
}

export interface RateLine {
  readonly serviceCode: string;
  readonly item: string;
  readonly unit: string;
  readonly priceFils: number;
}

const lineKey = (l: RateLine) => `${l.serviceCode}|${l.item.trim().toLowerCase()}|${l.unit}`;

/** True when any line costs more than the same line on the current card. */
export function raisesPrices(proposed: readonly RateLine[], current: readonly RateLine[]): boolean {
  const now = new Map(current.map((l) => [lineKey(l), l.priceFils]));
  return proposed.some((l) => {
    const before = now.get(lineKey(l));
    return before !== undefined && l.priceFils > before;
  });
}

/**
 * S9/P1: why a proposed rate card cannot be accepted, or null when it can. It must start at least 60 days
 * after today; and prices may not go up while the current card's 12 months are running.
 */
export function rateChangeProblem(
  effectiveFrom: string,
  today: string,
  raises: boolean,
  currentValidUntil: string | null,
): string | null {
  if (daysBetween(today, effectiveFrom) < RATE_CHANGE_NOTICE_DAYS) {
    return `A new rate card can start ${String(RATE_CHANGE_NOTICE_DAYS)} days from today at the earliest.`;
  }
  if (raises && currentValidUntil !== null && effectiveFrom <= currentValidUntil) {
    return `Prices are fixed until ${currentValidUntil}. A raise can start after that date.`;
  }
  return null;
}

/** The Monday-starting weeks (Dubai dates) from `firstMonday`, `count` of them, for the after-hours rota. */
export function weeksFrom(firstMonday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(firstMonday, i * 7));
}

/** Dubai local date and time ("YYYY-MM-DD HH:MM") of an instant, for exports. */
export function dubaiDateTime(t: number): string {
  return new Date(t + DUBAI_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
}

/** Whole percent, or null when there is nothing to measure. */
export function wholePercent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part * 100) / whole);
}

/** Days left before an instant (rounded up), never below 0. Used for a quote's 14-day validity (A2). */
export function daysLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / DAY));
}

/**
 * JAD+ targets a partner's month is compared with (S5, S6). The rating line is the S6 "low client reviews"
 * line; on-time and repeat-visit targets are JAD+'s own (ADR 0025).
 */
export const PARTNER_TARGETS = {
  onTimePercent: 95,
  averageRating: LOW_RATING_AVERAGE,
  repeatVisitPercent: 5,
} as const;

/** How close to the S6 line a rating average is allowed to come before the office is warned. */
export const RATING_WARNING_MARGIN = 0.3;

export type ReviewWatch =
  | { readonly kind: 'low_rating'; readonly level: 'warning' | 'flagged'; readonly average: number }
  | { readonly kind: 'missed_emergencies'; readonly level: 'warning' | 'flagged'; readonly count: number }
  | { readonly kind: 'breach'; readonly level: 'flagged' };

/**
 * S6, seen by the partner office: the flags JAD+ would raise today (reviewFlags), plus warnings when the
 * company is close: a 30-day average within 0.3 of 4.0, or one missed emergency short of the limit.
 */
export function reviewWatch(facts: ScorecardFacts, now: number): ReviewWatch[] {
  const flags = reviewFlags(facts, now);
  const out: ReviewWatch[] = [];
  const low = flags.find((f) => f.kind === 'low_rating');
  const recent = facts.ratings.filter((r) => r.at > now - RATING_WINDOW_DAYS * DAY && r.at <= now);
  if (low !== undefined) out.push({ kind: 'low_rating', level: 'flagged', average: low.average });
  else if (recent.length > 0) {
    const average = recent.reduce((s, r) => s + r.stars, 0) / recent.length;
    if (average < LOW_RATING_AVERAGE + RATING_WARNING_MARGIN) {
      out.push({ kind: 'low_rating', level: 'warning', average });
    }
  }
  const missed = flags.find((f) => f.kind === 'missed_emergencies');
  const missedRecent = facts.missedEmergencies.filter(
    (at) => at > now - MISSED_EMERGENCY_WINDOW_DAYS * DAY && at <= now,
  ).length;
  if (missed !== undefined) out.push({ kind: 'missed_emergencies', level: 'flagged', count: missed.count });
  else if (missedRecent === MISSED_EMERGENCY_LIMIT - 1) {
    out.push({ kind: 'missed_emergencies', level: 'warning', count: missedRecent });
  }
  if (flags.some((f) => f.kind === 'breach')) out.push({ kind: 'breach', level: 'flagged' });
  return out;
}

const EMERGENCY_SKILL: Record<EmergencyType, Skill> = {
  water_leak: 'plumbing',
  no_power: 'electrical',
  ac_failure: 'ac',
  lockout: 'carpentry',
  door_window_wont_lock: 'carpentry',
};

/** The skill a job needs, when it can be told from the emergency type; null = any technician. */
export function skillFor(emergencyType: EmergencyType | null): Skill | null {
  return emergencyType === null ? null : EMERGENCY_SKILL[emergencyType];
}

export interface DispatchCandidate {
  readonly id: string;
  readonly skills: readonly Skill[];
  readonly available: boolean;
  readonly visits: number;
}

/**
 * Dispatch suggestion: technicians available that day who have the skill the job needs (any, when none is
 * needed), fewest visits that day first. The office decides; this only orders the choice.
 */
export function suggestTechnicians(candidates: readonly DispatchCandidate[], skill: Skill | null): string[] {
  return candidates
    .filter((t) => t.available && (skill === null || t.skills.includes(skill)))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.visits - b.t.visits || a.i - b.i)
    .map(({ t }) => t.id);
}

/**
 * One CSV field (RFC 4180). A value a spreadsheet would run as a formula (=, +, -, @, tab, return) is
 * prefixed with an apostrophe, so an export can never carry a formula into Excel (CSV injection).
 */
export function csvField(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One CSV line, ending with CRLF. */
export function csvLine(values: readonly (string | number | null)[]): string {
  return `${values.map(csvField).join(',')}\r\n`;
}
