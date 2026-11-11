/**
 * How Investor Education (O5, S4; ADR 0033) is worded: the next date ("to be announced" when there is none), a
 * session's time and seats, what the owner can do, and the book request. Pure functions, tested without a phone.
 */
import {
  dubaiClock,
  dubaiDate,
  isSessionLink,
  type OwnerEducation,
  type OwnerSession,
} from '@jadplus/shared';
import { localDate } from '../i18n/format.js';
import type { Lang } from '../i18n/lang.js';
import { dayLabel } from '../jobs/format.js';

/** "Thu 12 Nov, 18:00 - 20:00" on the Dubai clock. */
export function sessionWhen(s: Pick<OwnerSession, 'startsAt' | 'endsAt'>, lang: Lang): string {
  return lang.t('education.when', {
    day: dayLabel(dubaiDate(s.startsAt), lang.locale),
    from: dubaiClock(s.startsAt),
    to: dubaiClock(s.endsAt),
  });
}

/** S4: always a next date, or "Next date to be announced". */
export function nextDateLine(e: Pick<OwnerEducation, 'nextStartsAt' | 'sessions'>, lang: Lang): string {
  if (e.nextStartsAt === null) return lang.t('education.nextTba');
  const next = e.sessions.find((s) => s.startsAt === e.nextStartsAt && !s.cancelled);
  return next === undefined
    ? dayLabel(dubaiDate(e.nextStartsAt), lang.locale)
    : `${next.title} · ${sessionWhen(next, lang)}`;
}

/** The session's state for this owner, in the order that matters most. */
export function seatLine(s: OwnerSession, lang: Lang): string {
  if (s.cancelled) return lang.t('education.cancelled');
  if (s.mySeat) return lang.t('education.mySeat');
  if (s.seatsLeft === 0) return lang.t('education.full');
  return s.seatsLeft === 1
    ? lang.t('education.seatLeft')
    : lang.t('education.seatsLeft', { count: s.seatsLeft });
}

export type SeatAction = 'reserve' | 'give_back' | null;

/** What the owner can do: reserve while seats are left and it has not started; give back until it starts. */
export function seatAction(s: OwnerSession, now: number): SeatAction {
  if (s.cancelled || now >= s.startsAt) return null;
  if (s.mySeat) return s.canCancel ? 'give_back' : null;
  return s.seatsLeft > 0 ? 'reserve' : null;
}

/** The joining link to open, only an https link the API gave to a seat holder. */
export function joinLink(s: OwnerSession): string | null {
  return s.mode === 'online' && s.mySeat && s.place !== null && isSessionLink(s.place) ? s.place : null;
}

/** Where it takes place: the address, or for an online session a note until the owner has a seat. */
export function placeLine(s: OwnerSession, lang: Lang): string {
  if (s.mode === 'in_person') return `${lang.t('education.inPerson')} · ${s.place ?? ''}`;
  return s.mySeat
    ? lang.t('education.online')
    : `${lang.t('education.online')} · ${lang.t('education.linkAfterSeat')}`;
}

/** The book card's line: nothing asked yet (null: show the button), requested, or sent. */
export function bookLine(book: OwnerEducation['book'], lang: Lang): string | null {
  if (book === null) return null;
  if (book.status === 'sent' && book.sentAt !== null) {
    return lang.t('education.bookSent', { date: localDate(book.sentAt, lang.locale) });
  }
  return lang.t('education.bookRequested', { date: localDate(book.requestedAt, lang.locale) });
}
