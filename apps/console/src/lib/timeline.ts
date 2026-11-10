/**
 * The facts recorded with a request event (ADR 0025 timeline), as one readable line. Internal ids are left
 * out (they mean nothing to a reader); times read as Dubai date and time.
 */
import { dateTime, humanize } from './format';

type Detail = Readonly<Record<string, string | number | boolean | null>> | null;

const HIDDEN = new Set(['id', 'visit', 'quote', 'photo', 'note']);
const isHidden = (key: string): boolean => HIDDEN.has(key) || key.endsWith('Id');
const isTime = (key: string): boolean => key.endsWith('At') || key.endsWith('Start') || key.endsWith('End');

/** "Window start: 12 Nov 2026, 10:00 · Revision: 2", or null when there is nothing to show. */
export function eventDetail(data: Detail): string | null {
  if (data === null) return null;
  const parts = Object.entries(data)
    .filter(([key, value]) => value !== null && !isHidden(key))
    .map(([key, value]) =>
      typeof value === 'number' && isTime(key)
        ? `${humanize(key)}: ${dateTime(value)}`
        : `${humanize(key)}: ${String(value)}`,
    );
  return parts.length === 0 ? null : parts.join(' · ');
}
