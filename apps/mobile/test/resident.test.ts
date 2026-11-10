/** Resident screens' rules: E2, E3, E12, L3, R1, R2. */
import { EMERGENCY_NUMBERS, EMERGENCY_TYPES, LIFE_SAFETY_TYPES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  asksWhereFrom,
  callLink,
  emergencyOptions,
  faultSourceOptions,
  lifeSafetyOptions,
  lifeSafetyReport,
} from '../src/emergency/options.js';
import { projectKey } from '../src/brand/projects.js';
import { translator } from '../src/i18n/lang.js';
import { placeLabel, residentStatusLabel } from '../src/jobs/format.js';

const en = translator('en');
const ar = translator('ar');

describe('emergency choices', () => {
  it('E2/E3: every emergency and life-safety type can be chosen, in plain words', () => {
    expect(emergencyOptions(en).map((o) => o.value)).toEqual([...EMERGENCY_TYPES]);
    expect(lifeSafetyOptions(en).map((o) => o.value)).toEqual([...LIFE_SAFETY_TYPES]);
    expect(lifeSafetyOptions(en).find((o) => o.value === 'injury')?.label).toBe('Someone is injured');
    expect(emergencyOptions(en).map((o) => o.label)).toEqual([
      'Water leak',
      'No power',
      'AC failure',
      'Locked out',
      "Door or window won't lock",
    ]);
  });

  it('ADR 0016: choices read in the chosen language; JAD+ is always told in English', () => {
    expect(emergencyOptions(ar).find((o) => o.value === 'water_leak')?.label).toBe('تسرب مياه');
    expect(lifeSafetyOptions(ar).find((o) => o.value === 'injury')?.label).toBe('يوجد شخص مصاب');
    expect(faultSourceOptions(ar).map((o) => o.value)).toEqual(faultSourceOptions(en).map((o) => o.value));
    expect(lifeSafetyReport('injury')).toBe('Someone is injured');
    expect(lifeSafetyReport('gas_smell')).toBe('Gas smell');
  });

  it('E12: only a leak asks where the water comes from; every source the API knows is offered', () => {
    expect(asksWhereFrom('water_leak')).toBe(true);
    expect(asksWhereFrom('lockout')).toBe(false);
    expect(faultSourceOptions(en).map((o) => o.value)).toEqual([
      'unit',
      'building',
      'neighbour',
      'fire_system',
    ]);
  });

  it('E3: each emergency number opens the phone dialler; nothing else can be dialled', () => {
    expect(EMERGENCY_NUMBERS.map((n) => callLink(n.number))).toEqual(['tel:999', 'tel:997', 'tel:998']);
    expect(() => callLink('0500000000')).toThrow();
  });
});

describe('what residents read', () => {
  it('R1/R2: statuses in plain words', () => {
    expect(residentStatusLabel('assigned', en)).toBe('Sent to the service partner');
    expect(residentStatusLabel('scheduled', en)).toBe('Technician on the way');
  });

  it('places read as unit, building and project', () => {
    expect(
      placeLabel({ unitName: 'JAD288-1102', project: 'JAD 288', building: 'Building B', address: null }, en),
    ).toBe('JAD288-1102 · Building B · JAD 288');
    expect(placeLabel(null, en)).toBe('Unit details with JAD+');
  });
});

describe('brand photos (docs/DESIGN.md)', () => {
  it('each project gets its photo, whatever the spelling from Salesforce', () => {
    expect(projectKey('JAD 288')).toBe('jad288');
    expect(projectKey('J288')).toBe('jad288');
    expect(projectKey('J188')).toBe('j188');
    expect(projectKey('171 Garden Heights')).toBe('171gh');
    expect(projectKey('Unknown Tower')).toBeNull();
    expect(projectKey(null)).toBeNull();
  });
});
