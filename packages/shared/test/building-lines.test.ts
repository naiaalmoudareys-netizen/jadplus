/** Building help lines (E12; ADR 0029): which faults show them, which line a unit sees, what is accepted. */
import { describe, expect, it } from 'vitest';
import {
  buildingLineBody,
  comesFromOutsideHome,
  linesFor,
  normaliseLinePhone,
  telHref,
} from '../src/building-lines.js';

const B = { project: 'JAD 288', building: 'Building B' };
const C = { project: 'JAD 288', building: 'Building C' };
const PROJECT = { project: 'JAD 288', building: null };
const OTHER = { project: 'J188', building: null };

describe('when the app shows the building lines (E12)', () => {
  it('E12: water from shared pipes, a neighbour or the fire sprinklers comes from outside the home', () => {
    expect(comesFromOutsideHome('building')).toBe(true);
    expect(comesFromOutsideHome('neighbour')).toBe(true);
    expect(comesFromOutsideHome('fire_system')).toBe(true);
  });

  it('E12: a fault inside the home does not show the building lines', () => {
    expect(comesFromOutsideHome('unit')).toBe(false);
  });
});

describe('which line a unit sees (E12)', () => {
  const line = (id: string, place: typeof B | typeof PROJECT, kind: 'security' | 'management') => ({
    id,
    ...place,
    kind,
  });

  it("E12: the building's own line wins over the project-wide one, per kind", () => {
    const lines = [
      line('p-sec', PROJECT, 'security'),
      line('b-sec', B, 'security'),
      line('p-man', PROJECT, 'management'),
    ];
    const seen = linesFor(lines, B);
    expect([seen.security?.id, seen.management?.id]).toEqual(['b-sec', 'p-man']);
  });

  it("E12: a neighbour building's line or another project's line is never shown", () => {
    const lines = [line('c-sec', C, 'security'), { id: 'o-man', ...OTHER, kind: 'management' as const }];
    expect(linesFor(lines, B)).toEqual({ security: null, management: null });
  });

  it('E12: a unit whose building Salesforce does not name sees only project-wide lines', () => {
    const lines = [line('b-sec', B, 'security'), line('p-sec', PROJECT, 'security')];
    expect(linesFor(lines, PROJECT).security?.id).toBe('p-sec');
  });
});

describe('numbers (E12)', () => {
  it('E12: mobiles and UAE landlines become +971…; anything else is refused', () => {
    expect(normaliseLinePhone('+971 4 000 0000')).toBe('+97140000000');
    expect(normaliseLinePhone('04 000 0000')).toBe('+97140000000');
    expect(normaliseLinePhone('050 000 0000')).toBe('+971500000000');
    expect(normaliseLinePhone('0000')).toBeNull();
    expect(normaliseLinePhone('call security')).toBeNull();
    expect(normaliseLinePhone('01 000 0000')).toBeNull();
  });

  it('E12: only an E.164 number becomes a tel: link', () => {
    expect(telHref('+97140000000')).toBe('tel:+97140000000');
    expect(telHref('javascript:alert(1)')).toBeNull();
    expect(telHref('04 000 0000')).toBeNull();
    expect(telHref('8000000')).toBe('tel:8000000');
    expect(telHref('600000000')).toBe('tel:600000000');
    expect(telHref('8000000; rm')).toBeNull();
  });

  it('E12: the admin body is strict, normalises the phone and keeps hours short and plain', () => {
    const ok = buildingLineBody.parse({
      ...B,
      kind: 'security',
      phone: '04 000 0000',
      hours: ' 24/7 ',
    });
    expect(ok).toEqual({ ...B, kind: 'security', phone: '+97140000000', hours: '24/7' });
    const base = { ...PROJECT, kind: 'management', phone: '+971 4 000 0000', hours: null };
    expect(buildingLineBody.safeParse(base).success).toBe(true);
    expect(buildingLineBody.safeParse({ ...base, kind: 'reception' }).success).toBe(false);
    expect(buildingLineBody.safeParse({ ...base, hours: 'x'.repeat(61) }).success).toBe(false);
    expect(buildingLineBody.safeParse({ ...base, hours: '<b>24/7</b>' }).success).toBe(false);
    expect(buildingLineBody.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(buildingLineBody.safeParse({ ...base, phone: 'none' }).success).toBe(false);
  });

  it('E12: UAE toll-free 800 and shared-cost 600 service numbers are accepted as dialled', () => {
    expect(normaliseLinePhone('800 0000')).toBe('8000000');
    expect(normaliseLinePhone('600 00 0000')).toBe('600000000');
    expect(normaliseLinePhone('800')).toBeNull();
  });
});
