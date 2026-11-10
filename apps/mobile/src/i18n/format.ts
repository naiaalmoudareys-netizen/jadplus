/** Dates in the person's language (ADR 0016), always on the Dubai calendar. */

/** "10 November 2026" / "10 نوفمبر 2026" / "10 novembre 2026" for a moment in time. */
export function localDate(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(at);
}
