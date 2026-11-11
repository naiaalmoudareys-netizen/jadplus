/**
 * Audit actions for managed units, furnishing delivery dates and interior design stages (ADR 0034; O4, O5, A1,
 * S4). Each module owns its list; audit.ts joins them.
 */
export const MANAGED_UNIT_ACTIONS = [
  'managed_unit_set',
  'managed_unit_ended',
  'managed_units_bulk_added',
  'manager_settings_changed',
  'managed_statement_uploaded',
  'managed_statement_downloaded',
  'request_approved_by_manager',
  'request_declined_by_manager',
  'tenancy_ended_by_manager',
  'delivery_date_set',
  'delivery_date_moved',
  'project_stage_moved',
] as const;
