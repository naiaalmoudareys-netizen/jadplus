/** My unit (R1, docs/DESIGN.md): the residence's facts, project and completion, from Salesforce. */
import type { ReactNode } from 'react';
import { area, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { DemoBadge, Fact, PortalError, UnitSwitcher } from '../../src/portal/ui.js';
import { Hero } from '../../src/ui/brand.js';
import { Body, Card, Loading, Notice, Page } from '../../src/ui/kit.js';

export default function MyUnit(): ReactNode {
  const { data, error, loading, dealIndex } = usePortal();
  if (loading && data === null) return <Loading />;
  if (data === null || error !== null) {
    return (
      <Page>
        <PortalError />
      </Page>
    );
  }
  const deal = data.deals[dealIndex] ?? data.deals[0];
  if (deal === undefined) {
    return (
      <Page>
        <Notice>No residence found on your account.</Notice>
      </Page>
    );
  }
  const u = deal.unit;
  return (
    <Page>
      <DemoBadge />
      <UnitSwitcher />
      <Hero project={u?.project ?? null} eyebrow={u?.project ?? 'Your residence'} title={unitTitle(deal)} />
      {u === null ? (
        <Body muted>The unit details are not available yet. Please contact the JAD+ desk.</Body>
      ) : (
        <Card>
          <Fact label="Type" value={u.type} />
          <Fact label="Bedrooms" value={u.bedrooms} />
          <Fact label="Bathrooms" value={u.bathrooms} />
          <Fact label="Floor" value={u.floor} />
          <Fact label="Building" value={u.building} />
          <Fact label="Internal area" value={area(u.internalArea)} />
          <Fact label="Balcony" value={area(u.balconyArea)} />
          <Fact label="Total area" value={area(u.totalArea)} />
          <Fact label="View" value={u.view} />
          <Fact label="Parking" value={u.parking} />
        </Card>
      )}
      <Card>
        <Fact label="Project" value={u?.project ?? null} />
        <Fact label="Location" value={u?.address ?? null} />
        <Fact label="Expected completion" value={longDate(u?.completion ?? null)} />
        <Fact label="Deal" value={deal.ref} />
        <Fact label="Status" value={deal.stage} />
        <Fact label="Your role" value={deal.role} />
      </Card>
    </Page>
  );
}
