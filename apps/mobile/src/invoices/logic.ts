/**
 * Partner invoices as the owner sees them (ADR 0026): amounts in AED from fils, the due or overdue line, the
 * status words, which invoices Home brings up, the order on Payments and the date for "I have paid". The owner
 * pays the partner directly; JAD+ only records it. Plain logic, tested without a phone.
 */
import {
  PAID_ON_MAX_AGE_DAYS,
  addDays,
  calendarDate,
  daysBetween,
  type InvoiceStatus,
  type OwnerInvoice,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Lang } from '../i18n/lang.js';
import { aed, longDate } from '../portal/format.js';

/** Home brings up an unpaid invoice from this many days before its due date. */
export const HOME_DUE_WITHIN_DAYS = 3;

/** "AED 1,050" or "AED 1,050.50" from fils (1 AED = 100 fils). */
export function aedFromFils(fils: number, locale: string): string {
  return aed(fils / 100, locale);
}

/** What the status pill says: "Overdue" wins over "To pay" while nothing has been said about paying. */
export function invoiceStatusKey(invoice: Pick<OwnerInvoice, 'status' | 'overdue'>): MessageKey {
  if (invoice.status === 'issued' && invoice.overdue) return 'invoice.status.overdue';
  return STATUS_KEYS[invoice.status];
}

const STATUS_KEYS: Readonly<Record<InvoiceStatus, MessageKey>> = {
  issued: 'invoice.status.issued',
  claimed_paid: 'invoice.status.claimed_paid',
  paid: 'invoice.status.paid',
  cancelled: 'invoice.status.cancelled',
};

/** Still waiting for the money (the owner may already have said "I have paid"). */
export function isUnpaid(invoice: Pick<OwnerInvoice, 'status'>): boolean {
  return invoice.status === 'issued' || invoice.status === 'claimed_paid';
}

/**
 * The line under the amount: "Paid on 12 Nov 2026" once paid, nothing when cancelled, otherwise "Due today",
 * "Due tomorrow", "Due 24 Nov 2026" or "Overdue: was due 1 Nov 2026".
 */
export function dueText(
  invoice: Pick<OwnerInvoice, 'status' | 'overdue' | 'dueDate' | 'paidOn'>,
  today: string,
  lang: Lang,
): string {
  if (invoice.status === 'cancelled') return '';
  if (invoice.status === 'paid') {
    return invoice.paidOn === null
      ? ''
      : lang.t('invoice.paidOn', { date: longDate(invoice.paidOn, lang.locale) });
  }
  const date = longDate(invoice.dueDate, lang.locale);
  if (invoice.overdue) return lang.t('invoice.overdue', { date });
  if (invoice.dueDate === today) return lang.t('invoice.dueToday');
  if (invoice.dueDate === addDays(today, 1)) return lang.t('invoice.dueTomorrow');
  return lang.t('invoice.due', { date });
}

/**
 * Home's "Invoice to pay": invoices not paid and not yet reported as paid, overdue or due within three days,
 * the earliest due first.
 */
export function invoicesForHome(invoices: readonly OwnerInvoice[], today: string): OwnerInvoice[] {
  return invoices
    .filter(
      (i) => i.status === 'issued' && (i.overdue || daysBetween(today, i.dueDate) <= HOME_DUE_WITHIN_DAYS),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Payments: unpaid first (earliest due first), then paid and cancelled, newest first. */
export function orderInvoices(invoices: readonly OwnerInvoice[]): OwnerInvoice[] {
  const open = invoices.filter(isUnpaid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = invoices.filter((i) => !isUnpaid(i)).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return [...open, ...done];
}

export type PaidOnChoice = 'today' | 'yesterday' | 'other';

/**
 * The date sent with "I have paid": today, yesterday (Dubai calendar) or a typed YYYY-MM-DD, checked with the
 * API's own rules (a real date, not in the future, at most a year back).
 */
export function paidOnDate(
  choice: PaidOnChoice,
  typed: string,
  today: string,
): { readonly date: string } | { readonly problem: MessageKey } {
  if (choice === 'today') return { date: today };
  if (choice === 'yesterday') return { date: addDays(today, -1) };
  const date = typed.trim();
  if (!calendarDate.safeParse(date).success) return { problem: 'invoice.dateInvalid' };
  if (date > today) return { problem: 'invoice.dateFuture' };
  if (daysBetween(date, today) > PAID_ON_MAX_AGE_DAYS) return { problem: 'invoice.dateOld' };
  return { date };
}
