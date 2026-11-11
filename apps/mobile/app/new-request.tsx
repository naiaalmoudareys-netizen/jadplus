/**
 * New request (ADR 0012, 0013, 0015). One short screen: the owner picks the project, then the unit (both
 * pre-selected when there is only one), then taps a service (S1; "coming soon" ones cannot be chosen, S2).
 * The details (day, time window, description, up to 3 photos) are asked in a pop-up from the bottom
 * (RequestSheet), so nobody scrolls through one long form. The answer names who has the request: the partner
 * company or the JAD+ team. Photos are re-saved on the phone without location data before they are sent.
 * A tenant raises one for their home; it first waits for the owner's approval (A1, ADR 0021), and the answer
 * says so. A line at the top sends problems outside the home (lobby, lift, corridor, parking, noise) to Building
 * help, the building's own numbers, instead of a partner request (E12, ADR 0029). A consultation service (leasing,
 * resale, mortgage, ...) opens its own pop-up with questions and the consent to share contact details (ADR 0031).
 */
import {
  SERVICE_GROUPS,
  type ConsultationRaised,
  type MyPlace,
  type RequestRaised,
  type ServiceView,
} from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../src/api/client.js';
import { addRequestPhoto, myPlaces, raiseRequest, services } from '../src/api/endpoints.js';
import { LinkRow } from '../src/building/HelpLines.js';
import { placeLabel } from '../src/jobs/format.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { serviceBlurb, serviceName } from '../src/i18n/sharedLabels.js';
import { preparePhoto } from '../src/requests/photoPicker.js';
import { OTHER_PROJECT, groupByProject, placeDetail, placeKey } from '../src/requests/places.js';
import { ConsultationSent } from '../src/requests/ConsultationSent.js';
import { ConsultationSheet } from '../src/requests/ConsultationSheet.js';
import { RequestSheet, type RequestDetails } from '../src/requests/RequestSheet.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Choice } from '../src/ui/Choice.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Eyebrow, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, space } from '../src/ui/theme.js';

/** `sentTo` is the partner company, or this English text when JAD+ handles it (api requests/routine.ts). */
const JAD_TEAM = 'the JAD+ team';

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.section}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

export default function NewRequest(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const t = useT();
  const loadServices = useCallback(() => services(api), [api]);
  const catalogue = useLoad(loadServices);
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const [chosenProject, setChosenProject] = useState<string | null>(null);
  const [chosenPlace, setChosenPlace] = useState<MyPlace | null>(null);
  const [service, setService] = useState<ServiceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ raised: RequestRaised; photoProblem: boolean } | null>(null);
  // ADR 0031: a consultation is sent from its own pop-up (questions, best time to call, consent).
  const [consultSent, setConsultSent] = useState<ConsultationRaised | null>(null);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if ((catalogue.loading && catalogue.data === null) || (places.loading && places.data === null)) {
    return <Loading />;
  }
  const projects = groupByProject(places.data ?? []);
  const group = projects.find((g) => g.project === chosenProject) ?? projects[0] ?? null;
  const units = group?.places ?? [];
  const place = units.find((p) => p === chosenPlace) ?? units[0] ?? null;

  const send = async (details: RequestDetails) => {
    if (place === null || service === null) return;
    setBusy(true);
    setError(null);
    try {
      const raised = await raiseRequest(api, place, {
        serviceCode: service.code,
        description: details.description,
        preferredDate: details.preferredDate,
        preferredSlot: details.preferredSlot,
        ...(details.snaggingType === undefined ? {} : { snaggingType: details.snaggingType }),
      });
      // The request is saved first; a photo that fails does not lose the request.
      let photoProblem = false;
      for (const photo of details.photos) {
        try {
          await addRequestPhoto(api, raised.requestId, await preparePhoto(photo));
        } catch {
          photoProblem = true;
        }
      }
      setSent({ raised, photoProblem });
    } catch (err) {
      setError(errorText(err, t, 'req.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (consultSent !== null && service !== null) {
    return (
      <ConsultationSent
        service={service}
        raised={consultSent}
        onFollow={() => {
          router.replace({ pathname: '/request/[id]', params: { id: consultSent.requestId } });
        }}
      />
    );
  }

  if (sent !== null) {
    return (
      <Page>
        <Eyebrow>{t('req.sent.eyebrow')}</Eyebrow>
        <Heading>
          {service === null ? t('req.sent.yourRequest') : serviceName(service.code, service.name, t)}
        </Heading>
        {sent.raised.awaitingOwner ? (
          <>
            <Text style={styles.confirmation}>{t('tenancy.sentForApproval')}</Text>
            <Body muted>
              {sent.raised.sentTo === JAD_TEAM
                ? t('tenancy.afterApprovalTeam')
                : t('tenancy.afterApproval', { name: sent.raised.sentTo })}
            </Body>
          </>
        ) : (
          <Text style={styles.confirmation}>
            {sent.raised.sentTo === JAD_TEAM
              ? t('req.sent.toTeam')
              : t('req.sent.to', { name: sent.raised.sentTo })}
          </Text>
        )}
        <Body muted>{t('req.sent.reference', { ref: sent.raised.ref })}</Body>
        {sent.photoProblem ? <Notice tone="error">{t('req.sent.photoProblem')}</Notice> : null}
        <Button
          title={t('req.follow')}
          onPress={() => {
            router.replace({ pathname: '/request/[id]', params: { id: sent.raised.requestId } });
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Heading>{t('title.newRequest')}</Heading>
      <LinkRow
        icon="business-outline"
        title={t('buildingHelp.requestLine')}
        note={t('buildingHelp.requestLineNote')}
        bordered={false}
        onPress={() => {
          router.push('/building-help');
        }}
      />

      {projects.length === 0 ? (
        <Notice tone="error">{t('req.noResidence')}</Notice>
      ) : (
        <>
          <Section title={t('req.project')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {projects.map((g) => (
                <Choice
                  key={g.project}
                  compact
                  title={g.project === OTHER_PROJECT ? t('req.project.other') : g.project}
                  detail={t(g.places.length === 1 ? 'req.units.one' : 'req.units.other', {
                    count: g.places.length,
                  })}
                  selected={g === group}
                  onPress={() => {
                    setChosenProject(g.project);
                    setChosenPlace(null);
                  }}
                />
              ))}
            </ScrollView>
          </Section>

          <Section title={t('req.unit')}>
            {units.map((p) => {
              const detail = placeDetail(p);
              return (
                <Choice
                  key={placeKey(p)}
                  title={p.location.unitName}
                  {...(detail === null ? {} : { detail })}
                  selected={p === place}
                  onPress={() => {
                    setChosenPlace(p);
                  }}
                />
              );
            })}
          </Section>
        </>
      )}

      <Section title={t('req.whatDoYouNeed')}>
        {catalogue.error === null ? null : <Notice tone="error">{catalogue.error}</Notice>}
        {SERVICE_GROUPS.map((g) =>
          (catalogue.data ?? [])
            .filter((s) => s.group === g)
            .map((s) => {
              const name = serviceName(s.code, s.name, t);
              return (
                <Choice
                  key={s.code}
                  title={s.routing === 'coming_soon' ? t('req.comingSoon', { name }) : name}
                  detail={serviceBlurb(s.code, s.blurb, t)}
                  selected={false}
                  disabled={s.routing === 'coming_soon' || place === null}
                  onPress={() => {
                    // Investor education is a seat on a session, not a visit (flow 'booking', ADR 0033).
                    if (s.flow === 'booking') {
                      router.push('/education');
                      return;
                    }
                    setError(null);
                    setService(s);
                  }}
                />
              );
            }),
        )}
      </Section>

      {service !== null && place !== null && service.flow === 'consultation' ? (
        <ConsultationSheet
          key={`${service.code}:${placeKey(place)}`}
          service={service}
          place={place}
          placeLabel={placeLabel(place.location, t)}
          onClose={() => {
            setService(null);
          }}
          onSent={setConsultSent}
        />
      ) : null}
      {service === null || place === null || service.flow === 'consultation' ? null : (
        <RequestSheet
          key={`${service.code}:${placeKey(place)}`}
          service={service}
          placeLabel={placeLabel(place.location, t)}
          busy={busy}
          error={error}
          onClose={() => {
            setService(null);
          }}
          onSend={(details) => void send(details)}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  confirmation: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.navy },
});
