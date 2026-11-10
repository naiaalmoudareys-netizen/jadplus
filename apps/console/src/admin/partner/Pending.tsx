/**
 * What waits for JAD+ Admin's decision across all partners (ADR 0025; S7, S9, S10): uploaded documents to
 * verify and proposed rate cards, counted per partner, each leading to the partner's page where it is decided.
 * Shown only when something waits.
 */
import { adminPartnerDocumentsResponse, adminRateChangesResponse } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { useConsole, useLoad } from '../../ui/hooks';
import { Link, Section } from '../../ui/parts';

interface Waiting {
  readonly id: string;
  readonly name: string;
  readonly documents: number;
  readonly rateCards: number;
}

export function PendingDecisions(): ReactNode {
  const { api } = useConsole();
  const { state } = useLoad(async () => {
    const [docs, rates] = await Promise.all([
      api.get('/api/admin/partner-documents?status=pending', adminPartnerDocumentsResponse),
      api.get('/api/admin/rate-card-changes?status=pending', adminRateChangesResponse),
    ]);
    const byPartner = new Map<string, Waiting>();
    const add = (id: string, name: string, kind: 'documents' | 'rateCards'): void => {
      const w = byPartner.get(id) ?? { id, name, documents: 0, rateCards: 0 };
      byPartner.set(id, { ...w, [kind]: w[kind] + 1 });
    };
    for (const u of docs.uploads) add(u.partnerId, u.partnerName, 'documents');
    for (const c of rates.changes) add(c.partnerId, c.partnerName, 'rateCards');
    return [...byPartner.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, 'pending');
  // A failure here must not hide the partner list below; the partner page shows the same items with errors.
  if (state.status !== 'ready' || state.data.length === 0) return null;
  return (
    <Section title="Waiting for your decision" count={state.data.length}>
      <ul className="plain">
        {state.data.map((w) => (
          <li key={w.id}>
            <Link to={{ name: 'partner', id: w.id }}>{w.name}</Link>
            {w.documents === 0 ? null : (
              <span className="muted">
                {' '}
                · {w.documents === 1 ? '1 document' : `${String(w.documents)} documents`}
              </span>
            )}
            {w.rateCards === 0 ? null : (
              <span className="muted">
                {' '}
                · {w.rateCards === 1 ? '1 rate-card change' : `${String(w.rateCards)} rate-card changes`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
