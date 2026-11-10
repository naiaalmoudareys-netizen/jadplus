/**
 * How requests are shown to the people allowed to see them (R1-R3, ADR 0009). Shared by the resident, partner
 * and message routes. Nothing here carries a phone number or email: contact happens inside JAD+.
 */
import type { RequestSummary, UnitLocation } from '@jadplus/shared';

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
export const SUMMARY_COLUMNS = `r.id, r.ref, r.is_emergency, r.emergency_type, r.status, p.name AS partner_name,
  r.arrival_window_start, r.arrival_window_end, r.created_at, ${LOCATION_COLUMNS}`;

export interface SummaryRow extends LocationRow {
  id: string;
  ref: string;
  is_emergency: number;
  emergency_type: RequestSummary['emergencyType'];
  status: RequestSummary['status'];
  partner_name: string | null;
  arrival_window_start: number | null;
  arrival_window_end: number | null;
  created_at: number;
}

export function toSummary(r: SummaryRow): RequestSummary {
  return {
    id: r.id,
    ref: r.ref,
    emergency: r.is_emergency === 1,
    emergencyType: r.emergency_type,
    status: r.status,
    partnerName: r.partner_name,
    arrivalWindow:
      r.arrival_window_start === null || r.arrival_window_end === null
        ? null
        : { start: r.arrival_window_start, end: r.arrival_window_end },
    location: toLocation(r),
    createdAt: r.created_at,
  };
}
