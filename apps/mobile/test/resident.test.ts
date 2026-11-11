/** Resident screens' rules: E2, E12, L3, R1, R2, ADR 0017. */
import { RAISABLE_EMERGENCY_TYPES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { asksWhereFrom, emergencyOptions, faultSourceOptions } from '../src/emergency/options.js';
import { projectKey } from '../src/brand/projects.js';
import { langOf, translator } from '../src/i18n/lang.js';
import { placeLabel, residentStatusLabel, residentVisitLine } from '../src/jobs/format.js';

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
  const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026
  const HOUR = 3_600_000;
  const english = langOf('en');
  const tomorrow = { start: NOW + 23 * HOUR, end: NOW + 25 * HOUR }; // Wed 11 Nov, 09:00-11:00 Dubai
  const today = { start: NOW + 2 * HOUR, end: NOW + 4 * HOUR }; // 12:00-14:00 Dubai
  const view = (
    status: 'assigned' | 'scheduled' | 'completed' | 'closed' | 'cancelled',
    visitStatus: 'booked' | 'on_the_way' | 'done' | null,
    arrivalWindow: { start: number; end: number } | null,
  ) => ({ status, visitStatus, arrivalWindow });

  it('R1/R2: statuses in plain words', () => {
    expect(residentStatusLabel(view('assigned', null, null), NOW, english)).toBe(
      'Sent to the service partner',
    );
    expect(residentStatusLabel(view('scheduled', null, null), NOW, english)).toBe('Visit booked');
  });

  it('A8: a visit booked for tomorrow reads "Visit booked" with its day and window, never "on the way"', () => {
    const r = view('scheduled', 'booked', tomorrow);
    expect(residentStatusLabel(r, NOW, english)).toBe('Visit booked: Wed 11 Nov, 09:00-11:00');
    expect(residentVisitLine(r, NOW, english)).toBeNull();
  });

  it('A8: on the visit day "Technician today"; "on the way" only once the technician said so', () => {
    expect(residentStatusLabel(view('scheduled', 'booked', today), NOW, english)).toBe('Technician today');
    expect(residentVisitLine(view('scheduled', 'booked', today), NOW, english)).toBe('Arriving 12:00-14:00');
    const moving = view('scheduled', 'on_the_way', today);
    expect(residentStatusLabel(moving, NOW, english)).toBe('Technician on the way');
    expect(residentVisitLine(moving, NOW, english)).toBe('Arriving 12:00-14:00');
    expect(residentStatusLabel(view('scheduled', 'booked', tomorrow), NOW, langOf('ar'))).not.toContain(
      'في الطريق',
    );
  });

  it('A5: after the work the window is history: "Visited <day>", or nothing once cancelled', () => {
    const before = { start: NOW - 25 * HOUR, end: NOW - 23 * HOUR }; // Mon 9 Nov
    expect(residentVisitLine(view('completed', 'done', before), NOW, english)).toBe('Visited Mon 9 Nov');
    expect(residentVisitLine(view('closed', 'done', before), NOW, english)).toBe('Visited Mon 9 Nov');
    expect(residentVisitLine(view('cancelled', null, before), NOW, english)).toBeNull();
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
