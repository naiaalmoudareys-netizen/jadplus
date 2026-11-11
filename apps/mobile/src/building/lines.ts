/**
 * Building help lines in the app (E12; ADR 0029): which numbers to offer for a home, and when the emergency
 * screen shows them. Pure, so it is tested without a phone. The API already picks a building's own line over the
 * project-wide one (shared linesFor); the app only finds the place of the chosen home.
 */
import {
  BUILDING_LINE_KINDS,
  comesFromOutsideHome,
  telHref,
  type BuildingLineKind,
  type FaultSource,
  type RaisableEmergencyType,
  type ResidentBuildingLines,
} from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import { asksWhereFrom } from '../emergency/options.js';

export type PlaceLines = ResidentBuildingLines['places'][number];

export interface HelpCall {
  readonly kind: BuildingLineKind;
  readonly phone: string;
  readonly hours: string | null;
  /** tel: link for the phone's dialler (E.164 only). */
  readonly href: string;
}

/** Words for each line: its name, what it is for, and its call button. */
export const LINE_WORDS: Readonly<
  Record<
    BuildingLineKind,
    { readonly name: MessageKey; readonly scope: MessageKey; readonly call: MessageKey }
  >
> = {
  security: {
    name: 'buildingHelp.security',
    scope: 'buildingHelp.securityFor',
    call: 'buildingHelp.callSecurity',
  },
  management: {
    name: 'buildingHelp.management',
    scope: 'buildingHelp.managementFor',
    call: 'buildingHelp.callManagement',
  },
};

/** The lines of the place a home is at (null when the home has no project, or the lines are not loaded). */
export function linesAt(
  places: readonly PlaceLines[] | null,
  location: { readonly project: string | null; readonly building: string | null } | null,
): PlaceLines | null {
  const project = location?.project ?? null;
  if (places === null || location === null || project === null) return null;
  return places.find((p) => p.project === project && p.building === location.building) ?? null;
}

/** The call buttons to show, security first; a line not set (or not callable) has no button. */
export function helpCalls(lines: PlaceLines | null): HelpCall[] {
  if (lines === null) return [];
  return BUILDING_LINE_KINDS.flatMap((kind) => {
    const line = lines[kind];
    const href = line === null ? null : telHref(line.phone);
    return line === null || href === null ? [] : [{ kind, phone: line.phone, hours: line.hours, href }];
  });
}

/** E12: the emergency screen offers the building's numbers for a leak coming from outside the home. */
export function showsBuildingCalls(type: RaisableEmergencyType | null, source: FaultSource): boolean {
  return type !== null && asksWhereFrom(type) && comesFromOutsideHome(source);
}
