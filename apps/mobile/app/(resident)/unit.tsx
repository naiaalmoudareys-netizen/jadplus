/** My unit (R1, docs/DESIGN.md): the residence's facts, project and completion, from Salesforce. */
import {
  DESK_REQUEST_HINTS,
  DOCUMENT_REQUEST_TYPES,
  latestDeskRequest,
  type DeskRequestType,
  type OwnerDeal,
  type OwnerPortalAnswer,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/client.js';
import { deskRequest } from '../../src/api/endpoints.js';
import { ConstructionSection } from '../../src/portal/ConstructionSection.js';
import { documentRow } from '../../src/portal/deskRows.js';
import { useLang } from '../../src/i18n/I18nProvider.js';
import { useSessionController } from '../../src/session/SessionProvider.js';
import { area, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { Photo } from '../../src/portal/Photo.js';
import { DemoBadge, Fact, LineItem, PortalError, UnitSwitcher } from '../../src/portal/ui.js';
import { useOpenDocument } from '../../src/portal/useOpenDocument.js';
import { Hero } from '../../src/ui/brand.js';
import { useScrollTarget } from '../../src/ui/scrollTarget.js';
import { Body, Button, Card, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { space } from '../../src/ui/theme.js';

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

/**
 * Documents: the residence's papers (SPA, Reservation Form, statement, NOC, title deed) with "Request" until
 * the JAD+ desk attaches them (ADR 0011), then the owner's own identity documents (Naya, 10-Nov-2026).
 */
function Documents({ data, deal }: { data: OwnerPortalAnswer; deal: OwnerDeal }): ReactNode {
  const doc = useOpenDocument();
  const { t, locale } = useLang();
  const { reload } = usePortal();
  const { api } = useSessionController();
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = (type: DeskRequestType) => {
    setSending(type);
    setError(null);
    deskRequest(api, { type, dealId: deal.id })
      .then(() => reload())
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'The request could not be sent. Please try again.');
      })
      .finally(() => {
        setSending(null);
      });
  };
  return (
    <>
      <Heading>Documents</Heading>
      <Card>
        {DOCUMENT_REQUEST_TYPES.map((type) => {
          const row = documentRow(latestDeskRequest(data.deskRequests, type, deal.id), t);
          const action = row.action;
          return (
            <LineItem
              key={type}
              title={type}
              detail={DESK_REQUEST_HINTS[type]}
              amount=""
              note={
                sending === type
                  ? 'Sending…'
                  : doc.opening !== null && action?.kind === 'open' && doc.opening === action.fileId
                    ? 'Opening…'
                    : row.note
              }
              {...(action === null
                ? {}
                : action.kind === 'open'
                  ? {
                      action: 'Open',
                      onPress: () => {
                        doc.open(action.fileId, `${type} ${unitTitle(deal, t)}`);
                      },
                    }
                  : {
                      action: 'Request',
                      onPress: () => {
                        request(type);
                      },
                    })}
            />
          );
        })}
        {data.documents.map((d) => (
          <LineItem
            key={d.fileId}
            title={d.name}
            detail={d.added === null ? null : `Added ${longDate(d.added, locale)}`}
            amount=""
            note={doc.opening === d.fileId ? 'Opening…' : null}
            onPress={() => {
              doc.open(d.fileId, d.name);
            }}
          />
        ))}
        <Body muted>
          Receipts are under Payments. Requested documents appear here once the JAD+ desk sends them.
        </Body>
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        {doc.error === null ? null : <Notice tone="error">{doc.error}</Notice>}
      </Card>
    </>
  );
}

export default function MyUnit(): ReactNode {
  const { data, error, loading, dealIndex } = usePortal();
  const scroll = useScrollTarget();
  const lang = useLang();
  const { t, locale } = lang;
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
    <Page scrollRef={scroll.ref}>
      <DemoBadge />
      <UnitSwitcher />
      <Hero
        project={u?.project ?? null}
        eyebrow={u?.project ?? 'Your residence'}
        title={unitTitle(deal, t)}
      />
      {u === null ? (
        <Body muted>The unit details are not available yet. Please contact the JAD+ desk.</Body>
      ) : (
        <Card>
          <Fact label="Type" value={u.type} />
          <Fact label="Bedrooms" value={u.bedrooms} />
          <Fact label="Bathrooms" value={u.bathrooms} />
          <Fact label="Floor" value={u.floor} />
          <Fact label="Building" value={u.building} />
          <Fact label="Internal area" value={area(u.internalArea, lang)} />
          <Fact label="Balcony" value={area(u.balconyArea, lang)} />
          <Fact label="Total area" value={area(u.totalArea, lang)} />
          <Fact label="View" value={u.view} />
          <Fact label="Parking" value={u.parking} />
        </Card>
      )}
      <Card>
        <Fact label="Project" value={u?.project ?? null} />
        <Fact label="Location" value={u?.address ?? null} />
        <Fact label="Expected completion" value={longDate(u?.completion ?? null, locale)} />
        <Fact label="Deal" value={deal.ref} />
        <Fact label="Status" value={deal.stage} />
        <Fact label="Your role" value={deal.role} />
      </Card>
      <FloorPlan fileId={u?.planFileId ?? null} unit={unitTitle(deal, t)} />
      <View style={styles.section} onLayout={scroll.onLayout('documents')}>
        <Documents data={data} deal={deal} />
      </View>
      <View style={styles.section} onLayout={scroll.onLayout('construction')}>
        <ConstructionSection project={u?.project ?? null} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({ section: { gap: space.md } });
