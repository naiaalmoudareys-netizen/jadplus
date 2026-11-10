/** Audit actions for the partner office (ADR 0025). Each module owns its list; audit.ts joins them. */
export const PARTNER_OFFICE_ACTIONS = [
  'technician_skills_set',
  'technician_unavailable_added',
  'technician_unavailable_removed',
  'partner_document_uploaded',
  'partner_document_viewed',
  'partner_document_accepted',
  'partner_document_rejected',
  'rate_card_change_proposed',
  'rate_card_change_accepted',
  'rate_card_change_rejected',
  'after_hours_contact_set',
  'partner_jobs_exported',
] as const;
