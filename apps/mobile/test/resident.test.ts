/** Resident screens' rules: E2, E3, E12, L3, R1, R2. */
import { EMERGENCY_NUMBERS, EMERGENCY_TYPES, LIFE_SAFETY_TYPES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_OPTIONS,
  FAULT_SOURCE_OPTIONS,
  LIFE_SAFETY_OPTIONS,
  asksWhereFrom,
  callLink,
} from '../src/emergency/options.js';
import { placeLabel, residentStatusLabel } from '../src/jobs/format.js';

describe('emergency choices', () => {
  it('E2/E3: every emergency and life-safety type can be chosen, in plain words', () => {
    expect(EMERGENCY_OPTIONS.map((o) => o.value)).toEqual([...EMERGENCY_TYPES]);
    expect(LIFE_SAFETY_OPTIONS.map((o) => o.value)).toEqual([...LIFE_SAFETY_TYPES]);
    expect(LIFE_SAFETY_OPTIONS.find((o) => o.value === 'injury')?.label).toBe('Someone is injured');
  });

  it('E12: only a leak asks where the water comes from; every source the API knows is offered', () => {
    expect(asksWhereFrom('water_leak')).toBe(true);
    expect(asksWhereFrom('lockout')).toBe(false);
    expect(FAULT_SOURCE_OPTIONS.map((o) => o.value)).toEqual([
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
    expect(residentStatusLabel('assigned')).toBe('Sent to the service partner');
    expect(residentStatusLabel('scheduled')).toBe('Technician on the way');
  });

  it('places read as unit, building and project', () => {
    expect(
      placeLabel({ unitName: 'JAD288-1102', project: 'JAD 288', building: 'Building B', address: null }),
    ).toBe('JAD288-1102 · Building B · JAD 288');
    expect(placeLabel(null)).toBe('Unit details with JAD+');
  });
});
