/**
 * The owner's homes grouped by project (Naya, 10-Nov-2026: "we need to be able to select the unit and the
 * project"). Plain logic, tested without a phone.
 */
import type { MyPlace } from '@jadplus/shared';

/** Shown for a unit whose project Salesforce does not give. */
export const OTHER_PROJECT = 'Other';

export interface ProjectGroup {
  readonly project: string;
  readonly places: readonly MyPlace[];
}

/** One group per project, in the order the projects first appear; units keep their order inside a project. */
export function groupByProject(places: readonly MyPlace[]): ProjectGroup[] {
  const groups = new Map<string, MyPlace[]>();
  for (const place of places) {
    const project = place.location.project ?? OTHER_PROJECT;
    const list = groups.get(project);
    if (list === undefined) groups.set(project, [place]);
    else list.push(place);
  }
  return [...groups].map(([project, list]) => ({ project, places: list }));
}

/** A stable key for a place (owners have a unit, tenants a tenancy). */
export function placeKey(place: MyPlace): string {
  return place.sfUnitId ?? place.tenancyId ?? place.location.unitName;
}

/** Building and address under the unit name, or null when neither is known. */
export function placeDetail(place: MyPlace): string | null {
  const parts = [place.location.building, place.location.address].filter((x) => x !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
