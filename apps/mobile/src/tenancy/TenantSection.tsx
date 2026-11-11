/**
 * The "Tenant" section on My unit for the residence shown (ADR 0021; R2, O4, U4, U5). The residence is found
 * in the owner's units (/api/me/places, by its Salesforce unit name) to get the unit id the tenancy is tied
 * to; then the section shows "Invite a tenant", or the tenant's card (TenancyCard).
 */
import { dubaiDate, type OwnerManagedUnit } from '@jadplus/shared';
import { useCallback, useState, type ReactNode } from 'react';
import { myPlaces, ownerTenancies } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Card, Eyebrow, Heading, Notice } from '../ui/kit.js';
import { currentArrangement } from '../managed/logic.js';
import { ManagedCard } from '../managed/ManagedParts.js';
import { InviteTenant } from './InviteTenant.js';
import { invitationSentText, placeForUnit, unitTenancy } from './logic.js';
import { TenancyCard } from './TenancyCard.js';

export function TenantSection({
  unitName,
  managed,
}: {
  unitName: string | null;
  /** The owner's managed units (ADR 0034). */
  managed: readonly OwnerManagedUnit[];
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const loadTenancies = useCallback(() => ownerTenancies(api), [api]);
  const tenancies = useLoad(loadTenancies);
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState<{ name: string; contact: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { reload } = tenancies;

  if (places.data === null || tenancies.data === null) {
    const error = places.error ?? tenancies.error;
    return (
      <>
        <Heading>{t('tenancy.title')}</Heading>
        {error === null ? <Body muted>{t('common.loading')}</Body> : <Notice tone="error">{error}</Notice>}
      </>
    );
  }
  const today = dubaiDate(Date.now());
  const place = placeForUnit(places.data, unitName);
  const sfUnitId = place?.sfUnitId ?? null;
  const tenancy = sfUnitId === null ? null : unitTenancy(tenancies.data, sfUnitId);
  // ADR 0034: a managed unit's tenant is looked after by the managing team; the owner reads.
  const arrangement = currentArrangement(managed, { sfUnitId, unitName });
  if (arrangement !== null) {
    return (
      <>
        <ManagedCard arrangement={arrangement} />
        <Heading>{t('tenancy.title')}</Heading>
        {tenancy === null ? (
          <Body muted>{t('managed.noTenant')}</Body>
        ) : (
          <TenancyCard tenancy={tenancy} today={today} onChanged={() => undefined} readOnly />
        )}
        <Body muted>{t('managed.tenantNote', { provider: arrangement.providerName })}</Body>
      </>
    );
  }

  return (
    <>
      <Heading>{t('tenancy.title')}</Heading>
      {sent === null ? null : (
        <Card>
          <Eyebrow>{t('tenancy.sent')}</Eyebrow>
          <Body>{invitationSentText(sent.name, sent.contact, t)}</Body>
        </Card>
      )}
      {note === null ? null : <Notice>{note}</Notice>}
      {sfUnitId === null ? (
        <Body muted>{t('tenancy.noPlace')}</Body>
      ) : tenancy !== null ? (
        <TenancyCard
          key={`${tenancy.id}:${tenancy.status}:${tenancy.endsOn}`}
          tenancy={tenancy}
          today={today}
          onChanged={(changed) => {
            setSent(null);
            setNote(changed);
            void reload();
          }}
        />
      ) : inviting ? (
        <InviteTenant
          sfUnitId={sfUnitId}
          today={today}
          onSent={(who) => {
            setInviting(false);
            setNote(null);
            setSent(who);
            void reload();
          }}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : (
        <>
          <Body muted>{t('tenancy.none')}</Body>
          <Button
            title={t('tenancy.invite')}
            onPress={() => {
              setNote(null);
              setInviting(true);
            }}
          />
        </>
      )}
    </>
  );
}
