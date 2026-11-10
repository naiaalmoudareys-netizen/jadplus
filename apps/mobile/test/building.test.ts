/** V1: building notices and home guide wording (time spans, order, icons) in the person's language. */
import { GUIDE_SECTIONS, NOTICE_KINDS } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  GUIDE_ICONS,
  NOTICE_ICONS,
  guideSectionLabel,
  noticeKindLabel,
  noticeSpan,
  orderNotices,
  placeTitle,
  type ResidentNotice,
} from '../src/building/wording.js';
import { langOf } from '../src/i18n/lang.js';

const en = langOf('en');
const fr = langOf('fr');

const HOUR = 3_600_000;
/** 10:00 Dubai, Tue 10 Nov 2026. */
const NOW = Date.UTC(2026, 10, 10, 6, 0, 0);
/** Dubai midnight starting Tue 10 Nov 2026. */
const TODAY = Date.UTC(2026, 10, 9, 20, 0, 0);
const at = (dayOffset: number, hour: number): number => TODAY + dayOffset * 24 * HOUR + hour * HOUR;

const notice = (over: Partial<ResidentNotice>): ResidentNotice => ({
  id: 'n',
  project: 'JAD 288',
  building: null,
  kind: 'water',
  title: 'Water shut-off',
  body: 'Planned maintenance of the tanks.',
  startsAt: at(0, 10),
  endsAt: at(0, 14),
  state: 'current',
  ...over,
});

describe('V1: notice time span', () => {
  it('V1: same day reads "Today 10:00 - 14:00"', () => {
    expect(noticeSpan(notice({}), NOW, en)).toBe('Today 10:00 - 14:00');
  });

  it('V1: tomorrow is named, later days get a short date', () => {
    expect(noticeSpan(notice({ startsAt: at(1, 9), endsAt: at(1, 12) }), NOW, en)).toBe(
      'Tomorrow 09:00 - 12:00',
    );
    expect(noticeSpan(notice({ startsAt: at(2, 9), endsAt: at(2, 12) }), NOW, en)).toBe(
      'Thu 12 Nov 09:00 - 12:00',
    );
  });

  it('V1: overnight spans name both days', () => {
    expect(noticeSpan(notice({ startsAt: at(0, 22), endsAt: at(1, 6) }), NOW, en)).toBe(
      'Today 22:00 - Tomorrow 06:00',
    );
  });

  it('V1: whole days leave out midnight', () => {
    expect(noticeSpan(notice({ startsAt: at(2, 0), endsAt: at(3, 0) }), NOW, en)).toBe('Thu 12 Nov');
    expect(noticeSpan(notice({ startsAt: at(2, 0), endsAt: at(4, 0) }), NOW, en)).toBe(
      'Thu 12 Nov - Fri 13 Nov',
    );
  });

  it('V1: no end reads "From ..."', () => {
    expect(noticeSpan(notice({ startsAt: at(2, 0), endsAt: null }), NOW, en)).toBe('From Thu 12 Nov');
    expect(noticeSpan(notice({ startsAt: at(0, 8), endsAt: null }), NOW, en)).toBe('From today 08:00');
    expect(noticeSpan(notice({ startsAt: at(1, 0), endsAt: null }), NOW, en)).toBe('From tomorrow');
  });

  it('V1: "from today" reads naturally mid-sentence in other languages', () => {
    expect(noticeSpan(notice({ startsAt: at(0, 8), endsAt: null }), NOW, fr)).toBe(
      'À partir d’aujourd’hui 08:00',
    );
    expect(noticeSpan(notice({ startsAt: at(2, 0), endsAt: null }), NOW, fr)).toMatch(/^À partir du /);
  });

  it('V1: other languages use their own words', () => {
    expect(noticeSpan(notice({}), NOW, fr)).toBe('Aujourd’hui 10:00 - 14:00');
  });
});

describe('V1: notice order', () => {
  it('V1: current first, then upcoming, each soonest first; ended and withdrawn left out', () => {
    const list = [
      notice({ id: 'up2', state: 'upcoming', startsAt: at(3, 9) }),
      notice({ id: 'cur2', startsAt: at(0, 9) }),
      notice({ id: 'gone', state: 'ended' }),
      notice({ id: 'up1', state: 'upcoming', startsAt: at(1, 9) }),
      notice({ id: 'cur1', startsAt: at(-1, 9) }),
      notice({ id: 'off', state: 'withdrawn' }),
    ];
    expect(orderNotices(list).map((n) => n.id)).toEqual(['cur1', 'cur2', 'up1', 'up2']);
  });
});

describe('V1: kinds, sections and places', () => {
  it('V1: every notice kind and guide section has an icon and a label', () => {
    for (const kind of NOTICE_KINDS) {
      expect(NOTICE_ICONS[kind]).toBeTruthy();
      expect(noticeKindLabel(kind, en.t)).not.toBe('');
    }
    for (const section of GUIDE_SECTIONS) {
      expect(GUIDE_ICONS[section]).toBeTruthy();
      expect(guideSectionLabel(section, en.t)).not.toBe('');
    }
    expect(noticeKindLabel('lift', en.t)).toBe('Lift');
    expect(guideSectionLabel('parking', fr.t)).toBe('Parking');
  });

  it('V1: a place reads "Building · Project", or the project alone', () => {
    expect(placeTitle({ project: 'JAD 288', building: 'Building B' })).toBe('Building B · JAD 288');
    expect(placeTitle({ project: 'JAD 288', building: null })).toBe('JAD 288');
  });
});
