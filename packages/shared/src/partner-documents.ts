/**
 * Partner contract documents (S7, S10, P3): the single list of kinds, the two every partner must hold, and the
 * words people read. Every app (API daily check, console, partner office) uses these, never its own copy.
 */

/** Contract documents (S10). Mirrors partner_documents.kind in migrations 0003 and 0021. */
export const PARTNER_DOCUMENT_KINDS = [
  'trade_licence',
  'insurance',
  'signed_sop_sla_kpi',
  'rate_card',
] as const;
export type PartnerDocumentKind = (typeof PARTNER_DOCUMENT_KINDS)[number];

/** S7/P3: the documents a partner must hold, valid, to take jobs. Both always carry an expiry date. */
export const REQUIRED_PARTNER_DOCUMENTS = ['trade_licence', 'insurance'] as const;
export type RequiredPartnerDocument = (typeof REQUIRED_PARTNER_DOCUMENTS)[number];

/** What people read for each kind; raw codes are never shown. */
export const PARTNER_DOCUMENT_LABELS: Readonly<Record<PartnerDocumentKind, string>> = {
  trade_licence: 'Trade licence',
  insurance: 'Insurance',
  signed_sop_sla_kpi: 'Signed SOP, SLA and KPIs',
  rate_card: 'Signed rate card',
};

export function isPartnerDocumentKind(kind: string): kind is PartnerDocumentKind {
  return (PARTNER_DOCUMENT_KINDS as readonly string[]).includes(kind);
}

/** A human label for any stored kind; an unknown code reads as "Other document", never as the code. */
export function partnerDocumentLabel(kind: string): string {
  return isPartnerDocumentKind(kind) ? PARTNER_DOCUMENT_LABELS[kind] : 'Other document';
}

/** A licence and an insurance always carry an expiry date (S7); the other documents may. */
export function expiryRequired(kind: PartnerDocumentKind): boolean {
  return (REQUIRED_PARTNER_DOCUMENTS as readonly string[]).includes(kind);
}
