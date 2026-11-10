/** How money, dates and units read in the owner app (same conventions as the prototype). */
import type { OwnerDeal } from '@jadplus/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "AED 1,250,000" (whole dirhams; fils shown only when present). */
export function aed(amount: number): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  const text = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${amount < 0 ? '-' : ''}AED ${text}`;
}

/**
 * "13 Jul 2026" from a date as Salesforce gives it: YYYY-MM-DD, or DD-MM-YYYY for completion dates.
 * Anything else is shown as it is.
 */
export function longDate(value: string | null): string {
  if (value === null) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  const parts = iso !== null ? [iso[3], iso[2], iso[1]] : dmy !== null ? [dmy[1], dmy[2], dmy[3]] : null;
  if (parts === null) return value;
  const [d, m, y] = parts;
  const month = MONTHS[Number(m) - 1];
  return month === undefined ? value : `${String(Number(d))} ${month} ${y ?? ''}`;
}

/** "J188 · Unit 1204" (falls back to the Salesforce unit name). */
export function unitTitle(deal: OwnerDeal): string {
  const u = deal.unit;
  if (u === null) return deal.ref ?? 'Your residence';
  const project = u.project ?? '';
  return u.number === null ? u.name : `${project}${project === '' ? '' : ' · '}Unit ${u.number}`;
}

/** "1,266.8 sq ft" */
export function area(sqft: number | null): string | null {
  return sqft === null ? null : `${sqft.toLocaleString('en-US', { maximumFractionDigits: 1 })} sq ft`;
}
