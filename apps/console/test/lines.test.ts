import { describe, expect, it } from 'vitest';
import { BUILDING_LINE_LABELS } from '../src/lib/labels';
import { lineRows } from '../src/lib/platform';

const project = 'JAD 288';
const towerA = { project, building: 'Tower A' };
const towerB = { project, building: 'Tower B' };
const whole = { project, building: null };

describe('resident help lines on a building page (ADR 0029)', () => {
  const lines = [
    { id: 'p-sec', ...whole, kind: 'security' as const },
    { id: 'a-man', ...towerA, kind: 'management' as const },
    { id: 'b-sec', ...towerB, kind: 'security' as const },
  ];

  it("E12: a building shows its own line, else the project's line residents call instead", () => {
    const rows = lineRows(lines, towerA);
    expect(rows.map((r) => [r.kind, r.own?.id ?? null, r.inherited?.id ?? null])).toEqual([
      ['security', null, 'p-sec'],
      ['management', 'a-man', null],
    ]);
  });

  it('E12: the whole-project page shows only project-wide lines, never inherited ones', () => {
    const rows = lineRows(lines, whole);
    expect(rows.map((r) => [r.own?.id ?? null, r.inherited])).toEqual([
      ['p-sec', null],
      [null, null],
    ]);
  });

  it('E12: security covers noise complaints (Naya, 11-Nov-2026)', () => {
    expect(BUILDING_LINE_LABELS.security.scope).toMatch(/Noise/);
  });
});
