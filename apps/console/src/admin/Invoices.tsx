/**
 * JAD+ Admin "Invoices" (ADR 0026): partners' invoices recorded in JAD+ and paid directly to the partner. This
 * is the place in the navigation kept for them; the screens are being built with the invoices API.
 */
import type { ReactNode } from 'react';
import { PageHeader } from '../ui/parts';

export function AdminInvoices(): ReactNode {
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Invoices" />
      <p className="card muted">Partner invoices will be shown here (ADR 0026). They are being built now.</p>
    </>
  );
}
