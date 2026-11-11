/**
 * How requests are shown to the people allowed to see them (R1-R3, ADR 0009). Shared by the resident, partner
 * and message routes. Nothing here carries a phone number or email: contact happens inside JAD+.
 */
import type { RequestSummary, UnitLocation, VisitSlot } from '@jadplus/shared';

/**
 * SQL joining a request `r` to where its unit is: the most recent Salesforce copy of that unit (owner_units).
 * Exposes ou.unit_name, ou.project, ou.building, ou.address (all NULL when unknown).
 */
export const LOCATION_JOIN = `LEFT JOIN owner_units ou ON ou.rowid =
  (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = r.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)`;

export const LOCATION_COLUMNS = 'ou.unit_name, ou.project, ou.building, ou.address';

export interface LocationRow {
  unit_name: string | null;
  project: string | null;
  building: string | null;
  address: string | null;
}

export function toLocation(row: LocationRow): UnitLocation | null {
  if (row.unit_name === null) return null;
  return { unitName: row.unit_name, project: row.project, building: row.building, address: row.address };
}

/** Columns for a request summary; needs `r`, LOCATION_JOIN and `LEFT JOIN partners p ON p.id = r.partner_id`. */
// S8: a partner is "JAD+ verified" while active; the daily check suspends one whose licence or insurance lapsed (S7).
export const SUMMARY_COLUMNS = `r.id, r.ref, r.is_emergency, r.emergency_type, r.status, p.name AS partner_name,
  CASE WHEN p.status = 'active' THEN 1 ELSE 0 END AS partner_verified, p.kind AS partner_kind,
  (SELECT name FROM services WHERE code = r.service_code) AS service_name,
  r.arrival_window_start, r.arrival_window_end, r.preferred_date, r.preferred_slot, r.created_at, ${LOCATION_COLUMNS}`;

export interface SummaryRow extends LocationRow {
  id: string;
  ref: string;
  is_emergency: number;
  emergency_type: RequestSummary['emergencyType'];
  service_name: string | null;
  status: RequestSummary['status'];
  partner_name: string | null;
  partner_verified: number;
  partner_kind: RequestSummary['partnerKind'];
  arrival_window_start: number | null;
  arrival_window_end: number | null;
  preferred_date: string | null;
  preferred_slot: VisitSlot | null;
  created_at: number;
}

/** The owner's preferred visit, when both parts are set. */
export function toPreferredVisit(r: {
  preferred_date: string | null;
  preferred_slot: VisitSlot | null;
}): { date: string; slot: VisitSlot } | null {
  return r.preferred_date === null || r.preferred_slot === null
    ? null
    : { date: r.preferred_date, slot: r.preferred_slot };
}

export function toSummary(r: SummaryRow): RequestSummary {
  return {
    id: r.id,
    ref: r.ref,
    emergency: r.is_emergency === 1,
    emergencyType: r.emergency_type,
    serviceName: r.service_name,
    status: r.status,
    partnerName: r.partner_name,
    partnerVerified: r.partner_name !== null && r.partner_verified === 1,
    partnerKind: r.partner_name === null ? null : r.partner_kind,
    arrivalWindow:
      r.arrival_window_start === null || r.arrival_window_end === null
        ? null
        : { start: r.arrival_window_start, end: r.arrival_window_end },
    preferredVisit: toPreferredVisit(r),
    location: toLocation(r),
    createdAt: r.created_at,
  };
}
