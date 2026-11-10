/** Resident screens' rules: E2, E12, L3, R1, R2, ADR 0017. */
import { RAISABLE_EMERGENCY_TYPES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { asksWhereFrom, emergencyOptions, faultSourceOptions } from '../src/emergency/options.js';
import { projectKey } from '../src/brand/projects.js';
import { translator } from '../src/i18n/lang.js';
import { placeLabel, residentStatusLabel } from '../src/jobs/format.js';

const en = translator('en');
const ar = translator('ar');

describe('emergency choices', () => {
  it('ADR 0017: only a water leak or an AC failure can be reported, in plain words', () => {
    expect(emergencyOptions(en).map((o) => o.value)).toEqual([...RAISABLE_EMERGENCY_TYPES]);
    expect(emergencyOptions(en).map((o) => o.label)).toEqual(['Water leak', 'AC failure']);
  });

  it('ADR 0016: choices read in the chosen language', () => {
    expect(emergencyOptions(ar).find((o) => o.value === 'water_leak')?.label).toBe('تسرب مياه');
    expect(faultSourceOptions(ar).map((o) => o.value)).toEqual(faultSourceOptions(en).map((o) => o.value));
  });

  it('E12: only a leak asks where the water comes from; every source the API knows is offered', () => {
    expect(asksWhereFrom('water_leak')).toBe(true);
    expect(asksWhereFrom('ac_failure')).toBe(false);
    expect(faultSourceOptions(en).map((o) => o.value)).toEqual([
      'unit',
      'building',
      'neighbour',
      'fire_system',
    ]);
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
