/** Building help lines in the app (E12; ADR 0029): which buttons show, for which home and which leak. */
import { describe, expect, it } from 'vitest';
import {
  LINE_WORDS,
  helpCalls,
  linesAt,
  showsBuildingCalls,
  type PlaceLines,
} from '../src/building/lines.js';
import { langOf } from '../src/i18n/lang.js';

const blockC: PlaceLines = {
  project: 'JAD 288',
  building: 'Block C',
  security: { phone: '+97140000000', hours: '24/7' },
  management: null,
};
const j188: PlaceLines = {
  project: 'J188',
  building: null,
  security: { phone: '+97140000001', hours: null },
  management: { phone: '+971500000000', hours: 'Sun-Fri 8:00-18:00' },
};
const places = [blockC, j188];

describe('emergency screen (E12)', () => {
  it('E12: a leak from shared pipes, a neighbour or the sprinklers shows the building numbers', () => {
    expect(showsBuildingCalls('water_leak', 'building')).toBe(true);
    expect(showsBuildingCalls('water_leak', 'neighbour')).toBe(true);
    expect(showsBuildingCalls('water_leak', 'fire_system')).toBe(true);
  });

  it('E12: a leak inside the home, an AC failure or nothing chosen yet shows none', () => {
    expect(showsBuildingCalls('water_leak', 'unit')).toBe(false);
    expect(showsBuildingCalls('ac_failure', 'building')).toBe(false);
    expect(showsBuildingCalls(null, 'building')).toBe(false);
  });
});

describe('which buttons (E12)', () => {
  it("E12: the home's building lines are found by project and building", () => {
    expect(linesAt(places, { project: 'JAD 288', building: 'Block C' })).toBe(blockC);
    expect(linesAt(places, { project: 'J188', building: null })).toBe(j188);
    expect(linesAt(places, { project: 'JAD 288', building: 'Block D' })).toBeNull();
    expect(linesAt(places, { project: null, building: null })).toBeNull();
    expect(linesAt(null, { project: 'J188', building: null })).toBeNull();
  });

  it('E12: a line that is not set has no button; security comes first', () => {
    expect(helpCalls(blockC).map((c) => [c.kind, c.href])).toEqual([['security', 'tel:+97140000000']]);
    expect(helpCalls(j188).map((c) => c.kind)).toEqual(['security', 'management']);
    expect(helpCalls(null)).toEqual([]);
  });

  it('E12: a number that is not E.164 is never dialled', () => {
    const odd: PlaceLines = { ...blockC, security: { phone: 'tel:999', hours: null } };
    expect(helpCalls(odd)).toEqual([]);
  });

  it('E12: every line has its name, what it is for and its button in every language (noise under security)', () => {
    for (const code of ['en', 'ar', 'fr', 'ru', 'zh'] as const) {
      const { t } = langOf(code);
      for (const words of Object.values(LINE_WORDS)) {
        for (const key of [words.name, words.scope, words.call]) expect(t(key)).not.toBe(key);
      }
    }
    expect(langOf('en').t(LINE_WORDS.security.scope)).toMatch(/Noise/);
  });
});
