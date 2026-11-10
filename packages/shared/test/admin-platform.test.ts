/** JAD+ Admin platform rules (ADR 0025): S3, S4, V1, E12, E14, E20, N2. */
import { describe, expect, it } from 'vitest';
import {
  GUIDE_SECTIONS,
  NOTICE_LEAD_DAYS,
  acSeasonMonths,
  buildingContactBody,
  buildingKey,
  changedRanks,
  guideFor,
  guideSectionBody,
  noticeBody,
  noticeState,
  noticesFor,
  placeCovers,
  placesOf,
  platformSettings,
  platformSettingsResponse,
  serviceSlaTargets,
  servicePartnersBody,
} from '../src/admin-platform.js';
import { MAINTENANCE_SLA } from '../src/sla.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const B = { project: 'JAD 288', building: 'Building B' };
const C = { project: 'JAD 288', building: 'Building C' };
const PROJECT = { project: 'JAD 288', building: null };

const notice = (id: string, place: typeof B | typeof PROJECT, startsAt: number, endsAt: number | null) => ({
  id,
  ...place,
  startsAt,
  endsAt,
  withdrawnAt: null as number | null,
});

describe('places (E12, V1)', () => {
  it('V1: a project-wide item covers every building of the project; a building item only its own', () => {
    expect(placeCovers(PROJECT, B)).toBe(true);
    expect(placeCovers(B, B)).toBe(true);
    expect(placeCovers(B, C)).toBe(false);
    expect(placeCovers(PROJECT, { project: 'JAD 101', building: null })).toBe(false);
    expect(placeCovers(B, PROJECT)).toBe(false);
  });

  it('E12: building keys tell (project, building) pairs apart and units without a project are skipped', () => {
    expect(buildingKey(B)).not.toBe(buildingKey(C));
    expect(buildingKey(PROJECT)).not.toBe(buildingKey(B));
    expect(
      placesOf([
        { project: 'JAD 288', building: 'Building B' },
        { project: 'JAD 288', building: 'Building B' },
        { project: null, building: 'X' },
        { project: 'JAD 288', building: null },
      ]),
    ).toEqual([B, PROJECT]);
  });
});

describe('building notices (V1)', () => {
  it('V1: a notice is upcoming, then current from its start up to its end, then ended; withdrawn wins', () => {
    const n = { startsAt: NOW, endsAt: NOW + DAY, withdrawnAt: null };
    expect(noticeState(n, NOW - 1)).toBe('upcoming');
    expect(noticeState(n, NOW)).toBe('current');
    expect(noticeState(n, NOW + DAY)).toBe('ended');
    expect(noticeState({ ...n, endsAt: null }, NOW + 100 * DAY)).toBe('current');
    expect(noticeState({ ...n, withdrawnAt: NOW }, NOW)).toBe('withdrawn');
  });

  it(`V1: residents see current notices and those starting within ${NOTICE_LEAD_DAYS} days, for their places, soonest first`, () => {
    const all = [
      notice('later', B, NOW + 2 * DAY, null),
      notice('now', PROJECT, NOW - DAY, NOW + DAY),
      notice('far', B, NOW + (NOTICE_LEAD_DAYS + 1) * DAY, null),
      notice('over', B, NOW - 2 * DAY, NOW - DAY),
      notice('elsewhere', C, NOW - DAY, null),
      { ...notice('gone', B, NOW - DAY, null), withdrawnAt: NOW - 1 },
    ];
    expect(noticesFor(all, [B], NOW).map((n) => n.id)).toEqual(['now', 'later']);
    expect(noticesFor(all, [], NOW)).toEqual([]);
  });

  it('V1/L3: a notice is plain text with a known kind; the end comes after the start', () => {
    const ok = {
      ...B,
      kind: 'water',
      title: 'Water off',
      body: 'Tank cleaning.',
      startsAt: NOW,
      endsAt: null,
    };
    expect(noticeBody.safeParse(ok).success).toBe(true);
    expect(noticeBody.safeParse({ ...ok, kind: 'fire' }).success).toBe(false);
    expect(noticeBody.safeParse({ ...ok, body: '<script>x</script>' }).success).toBe(false);
    expect(noticeBody.safeParse({ ...ok, title: 'a\u0007b' }).success).toBe(false);
    expect(noticeBody.safeParse({ ...ok, endsAt: NOW }).success).toBe(false);
    expect(noticeBody.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

describe('home guide', () => {
  it("V1: per section the building's own text overrides the project-wide one, in the app's section order", () => {
    const sections = [
      { id: 'p-water', ...PROJECT, section: 'water' as const },
      { id: 'b-ac', ...B, section: 'ac' as const },
      { id: 'p-ac', ...PROJECT, section: 'ac' as const },
      { id: 'c-parking', ...C, section: 'parking' as const },
    ];
    expect(guideFor(sections, B).map((s) => s.id)).toEqual(['b-ac', 'p-water']);
    expect(guideFor(sections, C).map((s) => s.id)).toEqual(['p-ac', 'p-water', 'c-parking']);
    expect(GUIDE_SECTIONS[0]).toBe('ac');
    expect(guideSectionBody.safeParse({ ...B, section: 'pool', title: 'x', body: 'y' }).success).toBe(false);
  });
});

describe('services (S3, S4)', () => {
  it('S3: only the ranks that change are replaced; a swap replaces both', () => {
    const cur = { primary: 'a', backup: 'b' };
    expect(changedRanks(cur, { primary: 'a', backup: 'b' })).toEqual([]);
    expect(changedRanks(cur, { primary: 'a', backup: null })).toEqual(['backup']);
    expect(changedRanks(cur, { primary: 'b', backup: 'a' })).toEqual(['primary', 'backup']);
  });

  it('S3: the primary and the backup are two different partners (both may be cleared)', () => {
    expect(servicePartnersBody.safeParse({ primaryId: 'a', backupId: 'a' }).success).toBe(false);
    expect(servicePartnersBody.safeParse({ primaryId: null, backupId: null }).success).toBe(true);
    expect(servicePartnersBody.safeParse({ primaryId: 'a', backupId: 'b', x: 1 }).success).toBe(false);
  });

  it('S4: maintenance runs on the plan targets; other services have none wired yet', () => {
    expect(serviceSlaTargets('maintenance')).toEqual(Object.values(MAINTENANCE_SLA));
    expect(serviceSlaTargets('mortgage')).toEqual([]);
  });
});

describe('building contacts (E12)', () => {
  it('E12: a contact needs a phone or an email; phones are stored in international form', () => {
    const base = { ...B, name: 'Facility desk', role: 'Facility manager', phone: null, email: null };
    expect(buildingContactBody.safeParse(base).success).toBe(false);
    const parsed = buildingContactBody.parse({ ...base, phone: '050 000 0000' });
    expect(parsed.phone).toBe('+971500000000');
    expect(buildingContactBody.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });
});

describe('settings (E14, E20)', () => {
  it('E14/E20: the AC season is May to October; Saturday and Sunday are not working days; holidays listed', () => {
    expect(acSeasonMonths()).toEqual([5, 6, 7, 8, 9, 10]);
    const s = platformSettingsResponse.parse(platformSettings());
    expect(s.calendar.weekendDays).toEqual([0, 6]);
    expect(s.calendar.opens).toBe('09:00');
    expect(s.calendar.closes).toBe('18:00');
    expect(s.calendar.holidays).toContainEqual({ date: '2026-12-02', name: 'National Day' });
    expect(s.emergencyTypes.map((t) => t.type)).toEqual(['water_leak', 'ac_failure']);
    expect(s.sla.emergencyBackupMinutes).toBe(30);
  });
});
