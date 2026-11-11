/**
 * My unit (R1, docs/DESIGN.md): the residence's facts, project and completion, from Salesforce, and its tenant
 * (ADR 0021: invite, extend, end).
 */
import {
  DOCUMENT_REQUEST_TYPES,
  latestDeskRequest,
  type DeskRequestType,
  type OwnerDeal,
  type OwnerPortalAnswer,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorText } from '../../src/api/client.js';
import { deskRequest } from '../../src/api/endpoints.js';
import { GuideLink } from '../../src/building/BuildingParts.js';
import { HandoverSection } from '../../src/handover/HandoverSection.js';
import { BuildingHelpLink } from '../../src/building/HelpLines.js';
import { ConstructionSection } from '../../src/portal/ConstructionSection.js';
import { documentRow } from '../../src/portal/deskRows.js';
import { useLang, useT } from '../../src/i18n/I18nProvider.js';
import { deskHint, deskTypeLabel } from '../../src/i18n/sharedLabels.js';
import { useSessionController } from '../../src/session/SessionProvider.js';
import { area, longDate, unitTitle } from '../../src/portal/format.js';
import { usePortal } from '../../src/portal/PortalProvider.js';
import { Photo } from '../../src/portal/Photo.js';
import { DemoBadge, Fact, LineItem, PortalError, UnitSwitcher } from '../../src/portal/ui.js';
import { useOpenDocument } from '../../src/portal/useOpenDocument.js';
import { Hero } from '../../src/ui/brand.js';
import { DeskHelpLink } from '../../src/ui/HelpBits.js';
import { TenantSection } from '../../src/tenancy/TenantSection.js';
import { UnitReports } from '../../src/requests/UnitReports.js';
import { useScrollTarget } from '../../src/ui/scrollTarget.js';
import { Body, Button, Card, Heading, Loading, Notice, Page } from '../../src/ui/kit.js';
import { space } from '../../src/ui/theme.js';

/** The unit's floor plan, shown whole; a real plan can also be opened full size in the phone's viewer. */
function FloorPlan({ fileId, unit }: { fileId: string | null; unit: string }): ReactNode {
  const doc = useOpenDocument();
  const t = useT();
  return (
    <>
      <Heading>{t('owner.unit.floorPlan')}</Heading>
      {fileId === null ? (
        <Body muted>{t('owner.unit.floorPlanSoon')}</Body>
      ) : (
        <Card>
          <Photo id={fileId} project={null} label={t('owner.unit.floorPlanOf', { unit })} plain />
          {fileId.startsWith('demo-') ? null : (
            <Button
              title={t('owner.unit.openFull')}
              kind="secondary"
              busy={doc.opening === fileId}
              onPress={() => {
                doc.open(fileId, t('owner.unit.floorPlanTitle', { unit }));
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
        setError(errorText(err, t, 'owner.unit.sendError'));
      })
      .finally(() => {
        setSending(null);
      });
  };
  return (
    <>
      <Heading>{t('owner.documents')}</Heading>
      <Card>
        {DOCUMENT_REQUEST_TYPES.map((type) => {
          const row = documentRow(latestDeskRequest(data.deskRequests, type, deal.id), t);
          const action = row.action;
          return (
            <LineItem
              key={type}
              title={deskTypeLabel(type, t)}
              detail={deskHint(type, t)}
              amount=""
              note={
                sending === type
                  ? t('owner.unit.sending')
                  : doc.opening !== null && action?.kind === 'open' && doc.opening === action.fileId
                    ? t('owner.opening')
                    : row.note
              }
              {...(action === null
                ? {}
                : action.kind === 'open'
                  ? {
                      action: t('owner.open'),
                      onPress: () => {
                        doc.open(action.fileId, `${deskTypeLabel(type, t)} ${unitTitle(deal, t)}`);
                      },
                    }
                  : {
                      action: t('owner.unit.request'),
                      onPress: () => {
                        request(type);
                      },
                    })}
            />
          );
        })}
        <UnitReports unitName={deal.unit?.name ?? null} />
        {data.documents.map((d) => (
          <LineItem
            key={d.fileId}
            title={d.name}
            detail={d.added === null ? null : t('owner.unit.added', { date: longDate(d.added, locale) })}
            amount=""
            note={doc.opening === d.fileId ? t('owner.opening') : null}
            onPress={() => {
              doc.open(d.fileId, d.name);
            }}
          />
        ))}
        <Body muted>{t('owner.unit.docsNote')}</Body>
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
        <Notice>{t('owner.unit.none')}</Notice>
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
        eyebrow={u?.project ?? t('unit.fallback')}
        title={unitTitle(deal, t)}
      />
      {u === null ? (
        <Body muted>{t('owner.unit.noDetails')}</Body>
      ) : (
        <Card>
          <Fact label={t('owner.fact.type')} value={u.type} />
          <Fact label={t('owner.fact.bedrooms')} value={u.bedrooms} />
          <Fact label={t('owner.fact.bathrooms')} value={u.bathrooms} />
          <Fact label={t('owner.fact.floor')} value={u.floor} />
          <Fact label={t('owner.fact.building')} value={u.building} />
          <Fact label={t('owner.fact.internalArea')} value={area(u.internalArea, lang)} />
          <Fact label={t('owner.fact.balcony')} value={area(u.balconyArea, lang)} />
          <Fact label={t('owner.fact.totalArea')} value={area(u.totalArea, lang)} />
          <Fact label={t('owner.fact.view')} value={u.view} />
          <Fact label={t('owner.fact.parking')} value={u.parking} />
        </Card>
      )}
      <Card>
        <Fact label={t('owner.fact.project')} value={u?.project ?? null} />
        <Fact label={t('owner.fact.location')} value={u?.address ?? null} />
        <Fact label={t('owner.fact.completion')} value={longDate(u?.completion ?? null, locale)} />
        <Fact label={t('owner.fact.deal')} value={deal.ref} />
        <Fact label={t('owner.fact.status')} value={deal.stage} />
        <Fact label={t('owner.fact.role')} value={deal.role} />
      </Card>
      <View style={styles.section}>
        <TenantSection key={u?.name ?? deal.id} unitName={u?.name ?? null} />
      </View>
      {/* O2: the handover checklist, once the handover team has opened it (ADR 0033). */}
      <HandoverSection unitName={u?.name ?? null} />
      <FloorPlan fileId={u?.planFileId ?? null} unit={unitTitle(deal, t)} />
      <View style={styles.section} onLayout={scroll.onLayout('documents')}>
        <Documents data={data} deal={deal} />
      </View>
      <View style={styles.section} onLayout={scroll.onLayout('construction')}>
        <ConstructionSection project={u?.project ?? null} />
      </View>
      <GuideLink />
      <BuildingHelpLink />
      {/* U1: a residence the owner bought is not listed: one tap opens a case with the JAD+ desk. */}
      <DeskHelpLink title="help.unitMissing" note="help.unitMissingNote" text="help.unitMissingText" />
    </Page>
  );
}

const styles = StyleSheet.create({ section: { gap: space.md } });
