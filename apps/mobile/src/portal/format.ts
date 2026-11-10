/** How money, dates and units read in the owner app (same conventions as the prototype; ADR 0016). */
import type { OwnerDeal } from '@jadplus/shared';
import { isEnglish, latinDigits, type Lang, type Translate } from '../i18n/lang.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A number in the person's language, Western digits ("1,250,000" / "1 250 000"). */
function number(value: number, locale: string, options: Intl.NumberFormatOptions): string {
  return value.toLocaleString(isEnglish(locale) ? 'en-US' : latinDigits(locale), options);
}

/** "AED 1,250,000" (whole dirhams; fils shown only when present). "AED" stays in every language. */
export function aed(amount: number, locale: string): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  const text = number(Math.abs(amount), locale, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${amount < 0 ? '-' : ''}AED ${text}`;
}

/**
 * "13 Jul 2026" from a date as Salesforce gives it: YYYY-MM-DD, or DD-MM-YYYY for completion dates; in the
 * person's language otherwise ("13 juil. 2026"). Anything else is shown as it is.
 */
export function longDate(value: string | null, locale: string): string {
  if (value === null) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  const parts = iso !== null ? [iso[3], iso[2], iso[1]] : dmy !== null ? [dmy[1], dmy[2], dmy[3]] : null;
  if (parts === null) return value;
  const [d, m, y] = parts;
  const month = MONTHS[Number(m) - 1];
  if (month === undefined) return value;
  if (isEnglish(locale)) return `${String(Number(d))} ${month} ${y ?? ''}`;
  // A calendar date, not a moment: formatted at midnight UTC in UTC so the day never shifts.
  return new Intl.DateTimeFormat(latinDigits(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** "J188 · Unit 1204" (falls back to the Salesforce unit name). */
export function unitTitle(deal: OwnerDeal, t: Translate): string {
  const u = deal.unit;
  if (u === null) return deal.ref ?? t('unit.fallback');
  const project = u.project ?? '';
  if (u.number === null) return u.name;
  return `${project}${project === '' ? '' : ' · '}${t('unit.number', { number: u.number })}`;
}

/** "1,266.8 sq ft" */
export function area(sqft: number | null, lang: Lang): string | null {
  if (sqft === null) return null;
  return lang.t('unit.area', { value: number(sqft, lang.locale, { maximumFractionDigits: 1 }) });
}
