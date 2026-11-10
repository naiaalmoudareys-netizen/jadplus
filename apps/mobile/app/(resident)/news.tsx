/**
 * All news & offers (N1-N3), opened from "See all" on Home. Not a tab of its own (Naya, 10-Nov-2026); it lives
 * inside the owner tabs so it shares the owner's data.
 */
import type { ReactNode } from 'react';
import { NewsSection } from '../../src/portal/NewsSection.js';
import { usePortalOptional } from '../../src/portal/PortalProvider.js';
import { DemoBadge, PortalError } from '../../src/portal/ui.js';
import { Loading, Page } from '../../src/ui/kit.js';

export default function News(): ReactNode {
  const portal = usePortalOptional();
  if (portal === null) return <Page>{null}</Page>;
  if (portal.loading && portal.data === null) return <Loading />;
  if (portal.data === null || portal.error !== null) {
    return (
      <Page>
        <PortalError />
      </Page>
    );
  }
  return (
    <Page>
      <DemoBadge />
      <NewsSection />
    </Page>
  );
}
