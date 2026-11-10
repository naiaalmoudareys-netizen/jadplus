/** Audit actions for partner invoices (ADR 0026). Each module owns its list; audit.ts joins them. */
export const INVOICE_ACTIONS = [
  'invoice_issued',
  'invoice_marked_paid',
  'invoice_marked_not_received',
  'invoice_cancelled',
  'invoice_payment_claimed',
  'invoices_viewed',
] as const;
