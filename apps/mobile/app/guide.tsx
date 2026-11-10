/**
 * Home guide (V1; ADR 0025): what JAD Global tells residents about their building (air conditioning, water,
 * waste, parking, access, amenities), per building, each section opening with one tap. Information only, never
 * instructions (L3): a repair or a problem goes through Requests. Owners and tenants; reached from My unit, the
 * tenant's home card and Profile.
 */
import { Redirect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { myGuide } from '../src/api/endpoints.js';
import { OpenableRow, RowsCard } from '../src/building/BuildingParts.js';
import { GUIDE_ICONS, guideSectionLabel, placeTitle } from '../src/building/wording.js';
import { localDate } from '../src/i18n/format.js';
import { useLang } from '../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Loading, Notice, Page } from '../src/ui/kit.js';

export default function Guide(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const load = useCallback(() => myGuide(api), [api]);
  const guide = useLoad(load);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (guide.loading && guide.data === null) return <Loading />;
  const places = guide.data ?? [];
  return (
    <Page>
      <Notice>{t('guide.note')}</Notice>
      {guide.error === null ? null : <Notice tone="error">{guide.error}</Notice>}
      {guide.error === null && places.length === 0 ? <Body muted>{t('guide.empty')}</Body> : null}
      {places.map((place) => (
        <RowsCard
          key={`${place.project}|${place.building ?? ''}`}
          title={places.length > 1 ? placeTitle(place) : null}
        >
          {place.sections.map((s, i) => (
            <OpenableRow
              key={s.id}
              first={i === 0}
              icon={GUIDE_ICONS[s.section]}
              label={guideSectionLabel(s.section, t)}
              title={s.title}
              detail={t('guide.updated', { date: localDate(s.updatedAt, locale) })}
              body={s.body}
            />
          ))}
        </RowsCard>
      ))}
    </Page>
  );
}
