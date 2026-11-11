/**
 * What a partner office's menu shows (ADR 0034): pages for services the company does not hold are left out.
 * Handovers and "Snags to fix" for the handover team, Education for the education team, Managed units for a
 * property management team (or a company that manages units today). Until the capabilities are known, the
 * pages that depend on them are hidden. The API checks every call anyway; this only keeps the menu relevant.
 */
import type { PartnerCapabilities } from '@jadplus/shared';

/** Office pages that depend on what the company holds. */
export type GatedOfficePage = 'handovers' | 'education' | 'managed_units';

export function officeShows(caps: PartnerCapabilities | null, page: GatedOfficePage): boolean {
  if (caps === null) return false;
  switch (page) {
    case 'handovers':
      return caps.services.includes('handover');
    case 'education':
      return caps.services.includes('education');
    case 'managed_units':
      return caps.services.includes('property-management') || caps.managesUnits;
  }
}

/** "Snags to fix" on the jobs board: the handover team fixes snags (ADR 0032). */
export function showsSnagsToFix(caps: PartnerCapabilities | null): boolean {
  return caps?.services.includes('handover') === true;
}

const GATED: ReadonlySet<string> = new Set<GatedOfficePage>(['handovers', 'education', 'managed_units']);

/** Whether a route name is one of the gated office pages. */
export function isGatedOfficePage(name: string): name is GatedOfficePage {
  return GATED.has(name);
}
