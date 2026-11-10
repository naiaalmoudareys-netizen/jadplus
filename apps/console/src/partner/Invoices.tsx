/**
 * Partner office "Invoices" (ADR 0026): the company's invoices to JAD+, paid directly to the partner. This is
 * the place in the navigation kept for them; the screens are being built with the invoices API.
 */
import type { ReactNode } from 'react';
import { PageHeader } from '../ui/parts';

export function OfficeInvoices(): ReactNode {
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Invoices" />
      <p className="card muted">
        Your invoices to JAD+ will be shown here (ADR 0026). They are being built now.
      </p>
    </>
  );
}
