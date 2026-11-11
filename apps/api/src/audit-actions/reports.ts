/** Audit actions for reports and snag lists (ADR 0032; O3). Each module owns its list; audit.ts joins them. */
export const REPORT_AUDIT_ACTIONS = [
  'report_uploaded',
  'report_downloaded',
  'reinspection_requested',
  'snag_added',
  'snag_photo_added',
  'snag_removed',
  'snag_fixed',
  'snag_confirmed',
  'snag_reopened',
] as const;
