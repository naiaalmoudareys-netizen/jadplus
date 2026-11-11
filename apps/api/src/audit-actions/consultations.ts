/** Audit actions for consultations (ADR 0031). Each module owns its list; audit.ts joins them. */
export const CONSULTATION_ACTIONS_AUDIT = [
  'consultation_consent_given',
  'consultation_contact_made',
  'consultation_stage_moved',
  'consultation_closed',
  'consultation_contact_viewed',
] as const;
