/**
 * The partner office's capabilities (GET /api/partner/capabilities, ADR 0034), loaded once per office view for
 * the menu and the jobs board. Null while loading, on failure, and for every other role (nothing gated shows).
 */
import { partnerCapabilitiesResponse, type PartnerCapabilities } from '@jadplus/shared';
import { useEffect, useState } from 'react';
import { useConsole } from './hooks';

export function useCapabilities(): PartnerCapabilities | null {
  const { api, session } = useConsole();
  const [caps, setCaps] = useState<PartnerCapabilities | null>(null);
  const office = session.role === 'partner_admin' ? (session.partnerId ?? '') : null;
  useEffect(() => {
    setCaps(null);
    if (office === null) return undefined;
    let current = true;
    api.get('/api/partner/capabilities', partnerCapabilitiesResponse).then(
      (c) => {
        if (current) setCaps(c);
      },
      () => {
        // The gated pages simply stay hidden; every other page works as before.
      },
    );
    return () => {
      current = false;
    };
  }, [api, office]);
  return caps;
}
