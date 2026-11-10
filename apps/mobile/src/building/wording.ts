/**
 * How building notices and the home guide are worded and ordered (V1; ADR 0025). The notices' and the guide's
 * own titles and texts are shown as JAD+ wrote them; only the words around them (kind, "Upcoming", the time
 * span) come from the dictionary. Times are on the Dubai clock.
 */
import type Ionicons from '@expo/vector-icons/Ionicons';
import {
  dubaiClock,
  dubaiDate,
  type GuideSection,
  type NoticeKind,
  type ResidentGuide,
  type ResidentNotices,
} from '@jadplus/shared';
import type { ComponentProps } from 'react';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Lang, Translate } from '../i18n/lang.js';
import { dayLabel } from '../jobs/format.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ResidentNotice = ResidentNotices['notices'][number];
export type GuidePlace = ResidentGuide['places'][number];

const DAY_MS = 86_400_000;
const MIDNIGHT = '00:00';

export const NOTICE_ICONS: Readonly<Record<NoticeKind, IconName>> = {
  water: 'water-outline',
  power: 'flash-outline',
  lift: 'swap-vertical-outline',
  ac: 'snow-outline',
  works: 'construct-outline',
  other: 'information-circle-outline',
};

const NOTICE_KIND_KEYS: Readonly<Record<NoticeKind, MessageKey>> = {
  water: 'building.kind.water',
  power: 'building.kind.power',
  lift: 'building.kind.lift',
  ac: 'building.kind.ac',
  works: 'building.kind.works',
  other: 'building.kind.other',
};

export const GUIDE_ICONS: Readonly<Record<GuideSection, IconName>> = {
  ac: 'snow-outline',
  water: 'water-outline',
  waste: 'trash-outline',
  parking: 'car-outline',
  access: 'key-outline',
  amenities: 'barbell-outline',
  other: 'information-circle-outline',
};

const GUIDE_SECTION_KEYS: Readonly<Record<GuideSection, MessageKey>> = {
  ac: 'guide.section.ac',
  water: 'guide.section.water',
  waste: 'guide.section.waste',
  parking: 'guide.section.parking',
  access: 'guide.section.access',
  amenities: 'guide.section.amenities',
  other: 'guide.section.other',
};

/** "Water", "Lift" in the person's language. */
export function noticeKindLabel(kind: NoticeKind, t: Translate): string {
  return t(NOTICE_KIND_KEYS[kind]);
}

/** "Air conditioning", "Parking" in the person's language. */
export function guideSectionLabel(section: GuideSection, t: Translate): string {
  return t(GUIDE_SECTION_KEYS[section]);
}

/** Only current and upcoming notices, current ones first, then each group soonest first. */
export function orderNotices(notices: readonly ResidentNotice[]): ResidentNotice[] {
  const rank = (n: ResidentNotice): number => (n.state === 'current' ? 0 : 1);
  return notices
    .filter((n) => n.state === 'current' || n.state === 'upcoming')
    .sort((a, b) => rank(a) - rank(b) || a.startsAt - b.startsAt);
}

/** "Today", "Tomorrow", or "Thu 12 Nov" for a Dubai date. */
function dayWord(date: string, now: number, lang: Lang): string {
  if (date === dubaiDate(now)) return lang.t('building.today');
  if (date === dubaiDate(now + DAY_MS)) return lang.t('building.tomorrow');
  return dayLabel(date, lang.locale);
}

/** A day and, unless it is midnight, its time: "Thu 12 Nov 10:00", "Thu 12 Nov". */
function moment(at: number, now: number, lang: Lang): string {
  const day = dayWord(dubaiDate(at), now, lang);
  const clock = dubaiClock(at);
  return clock === MIDNIGHT ? day : `${day} ${clock}`;
}

/** Mid-sentence "today" and "tomorrow" read differently in each language, so they have their own wording. */
const FROM_NEAR_DAY: Readonly<Record<'today' | 'tomorrow', { day: MessageKey; at: MessageKey }>> = {
  today: { day: 'building.span.fromToday', at: 'building.span.fromTodayAt' },
  tomorrow: { day: 'building.span.fromTomorrow', at: 'building.span.fromTomorrowAt' },
};

/** "From today 08:00", "From tomorrow", "From Thu 12 Nov 10:00": a notice until JAD+ ends it. */
function openEnded(startsAt: number, now: number, lang: Lang): string {
  const day = dubaiDate(startsAt);
  const near = day === dubaiDate(now) ? 'today' : day === dubaiDate(now + DAY_MS) ? 'tomorrow' : null;
  if (near === null) return lang.t('building.span.from', { from: moment(startsAt, now, lang) });
  const time = dubaiClock(startsAt);
  const keys = FROM_NEAR_DAY[near];
  return time === MIDNIGHT ? lang.t(keys.day) : lang.t(keys.at, { time });
}

/**
 * When a notice applies: "Today 10:00 - 14:00", "Thu 12 Nov - Fri 13 Nov" (whole days), "Today 22:00 -
 * Tomorrow 06:00", "From Thu 12 Nov" or "From today 08:00" (until JAD+ ends it).
 */
export function noticeSpan(n: Pick<ResidentNotice, 'startsAt' | 'endsAt'>, now: number, lang: Lang): string {
  if (n.endsAt === null) return openEnded(n.startsAt, now, lang);
  const startDay = dubaiDate(n.startsAt);
  if (dubaiClock(n.startsAt) === MIDNIGHT && dubaiClock(n.endsAt) === MIDNIGHT) {
    // Whole days: a notice ending at midnight covers up to the day before.
    const lastDay = dubaiDate(n.endsAt - 1);
    const first = dayWord(startDay, now, lang);
    return lastDay === startDay
      ? first
      : lang.t('building.span.range', { from: first, to: dayWord(lastDay, now, lang) });
  }
  if (dubaiDate(n.endsAt) === startDay) {
    return lang.t('building.span.sameDay', {
      day: dayWord(startDay, now, lang),
      from: dubaiClock(n.startsAt),
      to: dubaiClock(n.endsAt),
    });
  }
  return lang.t('building.span.range', {
    from: moment(n.startsAt, now, lang),
    to: moment(n.endsAt, now, lang),
  });
}

/** "Building B · JAD 288", or the project alone for a project-wide guide (names as JAD+ holds them). */
export function placeTitle(place: Pick<GuidePlace, 'project' | 'building'>): string {
  return place.building === null ? place.project : `${place.building} · ${place.project}`;
}
