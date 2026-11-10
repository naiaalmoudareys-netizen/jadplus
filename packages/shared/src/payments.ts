/**
 * An owner's payment plan as shown in the app (R1, O1), ported from the prototype's proven rules
 * (portal-live public/app.js instState / dealSummary). Amounts are AED as Salesforce holds them; dates are
 * Dubai calendar dates (YYYY-MM-DD). JAD+ never takes payments: "Pay now" opens pay.jadglobal.ae (U11).
 */

export interface Instalment {
  readonly name: string;
  readonly seq: number | null;
  readonly amount: number;
  readonly paid: number;
  /** YYYY-MM-DD, or null for "on completion" / not yet scheduled. */
  readonly due: string | null;
  readonly description: string | null;
}

export type InstalmentKind = 'paid' | 'overdue' | 'soon' | 'part' | 'upcoming' | 'later';

export interface InstalmentState {
  readonly kind: InstalmentKind;
  readonly label: string;
  /** What is still to pay (0 when paid). */
  readonly balance: number;
}

/** Days within which an instalment counts as "due soon". */
export const DUE_SOON_DAYS = 30;
/** Differences of 1 AED or less are rounding, not money owed. */
const ROUNDING = 1;

const DAY_MS = 86_400_000;

function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** R1/O1: where one instalment stands today. */
export function instalmentState(i: Instalment, today: string): InstalmentState {
  const balance = i.amount - i.paid;
  if (i.amount > 0 && balance <= ROUNDING) return { kind: 'paid', label: 'Paid', balance: 0 };
  if (i.due === null) {
    const onCompletion = /complet|handover/i.test(`${i.name} ${i.description ?? ''}`);
    return { kind: 'later', label: onCompletion ? 'On completion' : 'Scheduled', balance };
  }
  const days = daysBetween(today, i.due);
  if (days < 0) return { kind: 'overdue', label: `Overdue ${plural(-days, 'day')}`, balance };
  if (days <= DUE_SOON_DAYS) {
    return { kind: 'soon', label: days === 0 ? 'Due today' : `Due in ${plural(days, 'day')}`, balance };
  }
  if (i.paid > 0) return { kind: 'part', label: 'Part paid', balance };
  return { kind: 'upcoming', label: 'Upcoming', balance };
}

export interface PlanSummary {
  readonly total: number;
  readonly paid: number;
  /** 0-100. */
  readonly percentPaid: number;
  readonly overdue: readonly { readonly instalment: Instalment; readonly state: InstalmentState }[];
  readonly overdueAmount: number;
  /** The next instalment to pay that is not overdue (dated ones first, then by sequence). */
  readonly next: { readonly instalment: Instalment; readonly state: InstalmentState } | null;
}

/** R1/O1: totals, overdue and next payment of one deal. `price` is used when no plan is on file. */
export function planSummary(instalments: readonly Instalment[], price: number, today: string): PlanSummary {
  const total = instalments.reduce((s, i) => s + i.amount, 0) || price;
  const paid = instalments.reduce((s, i) => s + Math.min(i.paid, i.amount || i.paid), 0);
  const states = instalments.map((instalment) => ({ instalment, state: instalmentState(instalment, today) }));
  const overdue = states.filter((x) => x.state.kind === 'overdue');
  const open = states
    .filter((x) => x.state.kind !== 'paid' && x.state.balance > ROUNDING)
    .sort(
      (a, b) =>
        (a.instalment.due === null ? 1 : 0) - (b.instalment.due === null ? 1 : 0) ||
        (a.instalment.due ?? '').localeCompare(b.instalment.due ?? '') ||
        (a.instalment.seq ?? 0) - (b.instalment.seq ?? 0),
    );
  return {
    total,
    paid,
    percentPaid: total > 0 ? Math.min(100, (paid / total) * 100) : 0,
    overdue,
    overdueAmount: overdue.reduce((s, x) => s + x.state.balance, 0),
    next: open.find((x) => x.state.kind !== 'overdue') ?? null,
  };
}

/** U11: the only place money is paid; JAD+ holds no card data. */
export const PAY_URL = 'https://pay.jadglobal.ae/';
