/**
 * Partner scorecard thresholds and compliance (BUILD_SPEC S5, S6, S7, P3, E11, V4).
 * Scorecards use real data only (S5). A flag puts the partner on JAD+ Admin's review list; ending the
 * contract is a human decision (S6 "admin may end contract").
 */

export const LOW_RATING_AVERAGE = 4.0;
export const RATING_WINDOW_DAYS = 30;
export const MISSED_EMERGENCY_LIMIT = 2;
export const MISSED_EMERGENCY_WINDOW_DAYS = 90;
export const DOCUMENT_WARNING_DAYS = 30;

const DAY = 86_400_000;

export interface ScorecardFacts {
  readonly ratings: readonly { readonly at: number; readonly stars: number }[];
  /** When each missed emergency SLA was recorded (sla_outcomes, metric emergency_*, outcome missed). */
  readonly missedEmergencies: readonly number[];
  /** Unresolved safety or honesty breaches (partner_incidents). */
  readonly breaches: readonly { readonly kind: 'safety_breach' | 'honesty_breach'; readonly at: number }[];
}

export type ReviewFlag =
  | { readonly kind: 'low_rating'; readonly average: number; readonly ratings: number }
  | { readonly kind: 'missed_emergencies'; readonly count: number }
  | { readonly kind: 'breach'; readonly breach: 'safety_breach' | 'honesty_breach' };

/**
 * S6 "low client reviews": average rating below 4.0 over the last 30 days, OR two missed emergencies in the
 * last 90 days, OR any safety/honesty breach. Evaluated daily, so every 30-day window is checked as it closes
 * (ADR 0004). Any rating counts: one poor rating in a quiet month is enough to be reviewed.
 */
export function reviewFlags(facts: ScorecardFacts, now: number): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const recent = facts.ratings.filter((r) => r.at > now - RATING_WINDOW_DAYS * DAY && r.at <= now);
  if (recent.length > 0) {
    const average = recent.reduce((sum, r) => sum + r.stars, 0) / recent.length;
    if (average < LOW_RATING_AVERAGE) flags.push({ kind: 'low_rating', average, ratings: recent.length });
  }
  const missed = facts.missedEmergencies.filter(
    (at) => at > now - MISSED_EMERGENCY_WINDOW_DAYS * DAY && at <= now,
  );
  if (missed.length >= MISSED_EMERGENCY_LIMIT)
    flags.push({ kind: 'missed_emergencies', count: missed.length });
  for (const b of facts.breaches) flags.push({ kind: 'breach', breach: b.kind });
  return flags;
}

export type DocumentStanding = 'valid' | 'expiring_soon' | 'lapsed' | 'missing';

/** Days from `today` to `date` (both YYYY-MM-DD). */
function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

/** S7/P3: a licence or insurance is flagged 30 days before expiry and lapses the day after its expiry date. */
export function documentStanding(expiresOn: string | null, today: string): DocumentStanding {
  if (expiresOn === null) return 'missing';
  const days = daysUntil(today, expiresOn);
  if (days < 0) return 'lapsed';
  return days <= DOCUMENT_WARNING_DAYS ? 'expiring_soon' : 'valid';
}

export interface Compliance {
  /** ok: may take jobs; warn: flag to admin; suspend: no new jobs, open jobs to the backup (S7). */
  readonly action: 'ok' | 'warn' | 'suspend';
  readonly licence: DocumentStanding;
  readonly insurance: DocumentStanding;
}

/** Latest expiry date on file for the trade licence and the insurance (null when none is on file). */
export function partnerCompliance(
  latest: { readonly licence: string | null; readonly insurance: string | null },
  today: string,
): Compliance {
  const licence = documentStanding(latest.licence, today);
  const insurance = documentStanding(latest.insurance, today);
  const both = [licence, insurance];
  const action = both.some((s) => s === 'lapsed' || s === 'missing')
    ? 'suspend'
    : both.includes('expiring_soon')
      ? 'warn'
      : 'ok';
  return { action, licence, insurance };
}

/** Why a partner is suspended: lapsed documents (lifted automatically when renewed) or an admin decision. */
export type SuspendedBy = 'compliance' | 'admin';

export interface PartnerStanding {
  readonly status: 'active' | 'suspended' | 'ended';
  readonly suspendedBy: SuspendedBy | null;
}

/**
 * S7/P3, applied daily: a lapsed or missing licence or insurance suspends an active partner. A partner the
 * daily check suspended is reinstated once both documents are valid again; a suspension by an admin is never
 * lifted automatically, and an ended contract is never touched.
 */
export function complianceChange(p: PartnerStanding, c: Compliance): 'suspend' | 'reinstate' | null {
  if (p.status === 'active' && c.action === 'suspend') return 'suspend';
  if (p.status === 'suspended' && p.suspendedBy === 'compliance' && c.action !== 'suspend')
    return 'reinstate';
  return null;
}

const DOCUMENT_LABEL = { licence: 'Trade licence', insurance: 'Insurance' } as const;

/** Plain reason shown to JAD+ Admin and the partner office, e.g. "Insurance lapsed". */
export function suspensionReason(c: Compliance): string {
  const parts: string[] = [];
  for (const doc of ['licence', 'insurance'] as const) {
    const standing = c[doc];
    if (standing === 'lapsed') parts.push(`${DOCUMENT_LABEL[doc]} lapsed`);
    if (standing === 'missing') parts.push(`${DOCUMENT_LABEL[doc]} not on file`);
  }
  return parts.join('; ');
}

/**
 * S6: the review-list key of a flag. One open item per partner and concern, so a concern already on the
 * admin's list is not added again by every daily run.
 */
export function reviewKey(flag: ReviewFlag): string {
  return flag.kind === 'breach' ? flag.breach : flag.kind;
}
