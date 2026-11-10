/** My unit (R1, docs/DESIGN.md): the residence's facts, project and completion, from Salesforce. */
import type { OwnerPortalAnswer } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { area, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { Photo } from '../../src/portal/Photo.js';
import { DemoBadge, Fact, LineItem, PortalError, UnitSwitcher } from '../../src/portal/ui.js';
import { useOpenDocument } from '../../src/portal/useOpenDocument.js';
import { Hero } from '../../src/ui/brand.js';
import { Body, Button, Card, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';

/** The unit's floor plan, shown whole; a real plan can also be opened full size in the phone's viewer. */
function FloorPlan({ fileId, unit }: { fileId: string | null; unit: string }): ReactNode {
  const doc = useOpenDocument();
  return (
    <>
      <Heading>Floor plan</Heading>
      {fileId === null ? (
        <Body muted>The floor plan for this residence will be added soon.</Body>
      ) : (
        <Card>
          <Photo id={fileId} project={null} label={`Floor plan of ${unit}`} plain />
          {fileId.startsWith('demo-') ? null : (
            <Button
              title="Open full size"
              kind="secondary"
              busy={doc.opening === fileId}
              onPress={() => {
                doc.open(fileId, `Floor plan ${unit}`);
              }}
            />
          )}
          {doc.error === null ? null : <Notice tone="error">{doc.error}</Notice>}
        </Card>
      )}
    </>
  );
}

/** The owner's own identity documents held by JAD Global (Naya, 10-Nov-2026: shown in the app). */
function Documents({ documents }: { documents: OwnerPortalAnswer['documents'] }): ReactNode {
  const doc = useOpenDocument();
  return (
    <>
      <Heading>Documents</Heading>
      <Card>
        {documents.length === 0 ? <Body muted>No documents on file yet.</Body> : null}
        {documents.map((d) => (
          <LineItem
            key={d.fileId}
            title={d.name}
            detail={d.added === null ? null : `Added ${longDate(d.added)}`}
            amount={doc.opening === d.fileId ? 'Opening…' : ''}
            onPress={() => {
              doc.open(d.fileId, d.name);
            }}
          />
        ))}
        <Body muted>
          Receipts are under Payments. For your SPA or a stamped statement, ask the JAD+ desk.
        </Body>
        {doc.error === null ? null : <Notice tone="error">{doc.error}</Notice>}
      </Card>
    </>
  );
}

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
      <FloorPlan fileId={u?.planFileId ?? null} unit={unitTitle(deal)} />
      <Documents documents={data.documents} />
    </Page>
  );
}
