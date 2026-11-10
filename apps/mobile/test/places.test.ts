/** Choosing the project and then the unit on New request (ADR 0015). */
import type { MyPlace } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { OTHER_PROJECT, groupByProject, placeDetail, placeKey } from '../src/requests/places.js';

const unit = (
  id: string,
  unitName: string,
  project: string | null,
  building: string | null = null,
): MyPlace => ({
  sfUnitId: id,
  tenancyId: null,
  location: { unitName, project, building, address: building === null ? null : 'Dubai' },
});

describe('project and unit choice', () => {
  it('groups units by project in the order projects first appear', () => {
    const a = unit('a', '1204-J188', 'J188');
    const b = unit('b', '506-JAD288-C', 'JAD 288', 'Block C');
    const c = unit('c', '1508-J188', 'J188');
    const groups = groupByProject([a, b, c]);
    expect(groups.map((g) => [g.project, g.places.map(placeKey)])).toEqual([
      ['J188', ['a', 'c']],
      ['JAD 288', ['b']],
    ]);
  });

  it('puts a unit without a project under "Other", and nothing gives no groups', () => {
    expect(groupByProject([unit('x', 'Villa 7', null)]).map((g) => g.project)).toEqual([OTHER_PROJECT]);
    expect(groupByProject([])).toEqual([]);
  });

  it('describes a unit by building and address, or nothing when unknown', () => {
    expect(placeDetail(unit('b', '506', 'JAD 288', 'Block C'))).toBe('Block C · Dubai');
    expect(placeDetail(unit('a', '1204', 'J188'))).toBeNull();
  });
});
