/**
 * Consultation words in the person's language (ADR 0031): questions, answers, stages and the provider's promise.
 * The ids come from packages/shared consultation.ts; an id the app does not know yet shows the server's English.
 */
import {
  WORKING_DAY_MINUTES,
  firstResponseTarget,
  type ConsultationQuestion,
  type TimelineState,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { isMessageKey, type Translate } from '../i18n/lang.js';

const lookup = (key: string, fallback: string, t: Translate): string =>
  isMessageKey(key) ? t(key) : fallback;

export const questionLabel = (q: ConsultationQuestion, t: Translate): string =>
  lookup(`cons.q.${q.id}`, q.label, t);

export const optionLabel = (id: string, fallback: string, t: Translate): string =>
  lookup(`cons.o.${id}`, fallback, t);

/** "Bank valuation", "Contact made", "Did not proceed". */
export const stepLabel = (id: string, t: Translate): string => lookup(`cons.step.${id}`, id, t);

const STATE_KEYS: Readonly<Record<TimelineState, MessageKey>> = {
  done: 'cons.state.done',
  current: 'cons.state.current',
  next: 'cons.state.next',
  not_reached: 'cons.state.not_reached',
};

export const timelineStateLabel = (state: TimelineState, t: Translate): string => t(STATE_KEYS[state]);

/** "1 working day", "2 working days": the service's first deadline (S4), for "will contact you within …". */
export function contactWithin(serviceCode: string, t: Translate): string {
  const target = firstResponseTarget(serviceCode);
  const days = Math.max(1, Math.round((target?.minutes ?? WORKING_DAY_MINUTES) / WORKING_DAY_MINUTES));
  return days === 1 ? t('cons.within.one') : t('cons.within.other', { count: days });
}

const DAY_MS = 86_400_000;

/**
 * Dates offered for "Available from" (no calendar control in the app): today ("Now"), then the 1st of each of the
 * next five months. YYYY-MM-DD, all within the year the API accepts.
 */
export function availableFromChoices(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  if (y === undefined || m === undefined || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) return [today];
  const firsts = [1, 2, 3, 4, 5].map((k) => new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 10));
  return [
    today,
    ...firsts.filter((d) => Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) < 366 * DAY_MS),
  ];
}
