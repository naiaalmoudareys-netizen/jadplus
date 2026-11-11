/**
 * Months, days, percentages and CSV for staff figures and reports (ADR 0025; S5, S6, R4).
 * Dubai is UTC+4 all year (no daylight saving).
 */
import { z } from 'zod';

const DAY = 86_400_000;
const DUBAI_OFFSET = 4 * 3_600_000;

/** "YYYY-MM": a calendar month, January to December. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');

/** The Dubai month that contains the instant `t`. */
export function monthOf(t: number): string {
  return new Date(t + DUBAI_OFFSET).toISOString().slice(0, 7);
}

/** The month before `month` (YYYY-MM). */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** A Dubai month as [start, end) in UTC milliseconds, for "created_at >= start AND created_at < end". */
export function monthRange(month: string): { readonly start: number; readonly end: number } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y ?? 1970, (m ?? 1) - 1, 1) - DUBAI_OFFSET;
  const end = Date.UTC(y ?? 1970, m ?? 1, 1) - DUBAI_OFFSET;
  return { start, end };
}

/** The Dubai day that contains `t`, as [start, end) in UTC milliseconds. */
export function dayRange(t: number): { readonly start: number; readonly end: number } {
  const start = Math.floor((t + DUBAI_OFFSET) / DAY) * DAY - DUBAI_OFFSET;
  return { start, end: start + DAY };
}

/** Share as a percentage with one decimal; null when there is nothing to measure (never "0 %" for no data). */
export function percent(part: number, total: number): number | null {
  return total <= 0 ? null : Math.round((part / total) * 1000) / 10;
}

/** An average with one decimal, or null with no values. */
export function average(sum: number, count: number): number | null {
  return count <= 0 ? null : Math.round((sum / count) * 10) / 10;
}

/**
 * One CSV cell (RFC 4180): quoted when needed, quotes doubled. A cell that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab/return) gets a leading apostrophe (CSV injection).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows to CSV text, lines ending in CRLF. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
