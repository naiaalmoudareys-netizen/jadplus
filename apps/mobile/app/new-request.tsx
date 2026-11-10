/**
 * New request (ADR 0012, 0013, 0015). One short screen: the owner picks the project, then the unit (both
 * pre-selected when there is only one), then taps a service (S1; "coming soon" ones cannot be chosen, S2).
 * The details (day, time window, description, up to 3 photos) are asked in a pop-up from the bottom
 * (RequestSheet), so nobody scrolls through one long form. The answer names who has the request: the partner
 * company or the JAD+ team. Photos are re-saved on the phone without location data before they are sent.
 */
import { SERVICE_GROUPS, type MyPlace, type RequestRaised, type ServiceView } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client.js';
import { addRequestPhoto, myPlaces, raiseRequest, services } from '../src/api/endpoints.js';
import { placeLabel } from '../src/jobs/format.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { preparePhoto } from '../src/requests/photoPicker.js';
import { groupByProject, placeDetail, placeKey } from '../src/requests/places.js';
import { RequestSheet, type RequestDetails } from '../src/requests/RequestSheet.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { Choice } from '../src/ui/Choice.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Eyebrow, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, space } from '../src/ui/theme.js';

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
      setError(err instanceof ApiError ? err.message : 'The request could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent !== null) {
    return (
      <Page>
        <Eyebrow>Request sent</Eyebrow>
        <Heading>{service?.name ?? 'Your request'}</Heading>
        <Text style={styles.confirmation}>{`Your request has been sent to ${sent.raised.sentTo}.`}</Text>
        <Body muted>{`Reference ${sent.raised.ref}. You will see every update in Requests.`}</Body>
        {sent.photoProblem ? (
          <Notice tone="error">
            A photo could not be added. You can describe it in a message on the request.
          </Notice>
        ) : null}
        <Button
          title="Follow this request"
          onPress={() => {
            router.replace({ pathname: '/request/[id]', params: { id: sent.raised.requestId } });
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Heading>New request</Heading>

      {projects.length === 0 ? (
        <Notice tone="error">
          No residence is linked to your account yet. Please contact the JAD+ desk.
        </Notice>
      ) : (
        <>
          <Section title="Project">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {projects.map((g) => (
                <Choice
                  key={g.project}
                  compact
                  title={g.project}
                  detail={g.places.length === 1 ? '1 unit' : `${String(g.places.length)} units`}
                  selected={g === group}
                  onPress={() => {
                    setChosenProject(g.project);
                    setChosenPlace(null);
                  }}
                />
              ))}
            </ScrollView>
          </Section>

          <Section title="Unit">
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

      <Section title="What do you need?">
        {catalogue.error === null ? null : <Notice tone="error">{catalogue.error}</Notice>}
        {SERVICE_GROUPS.map((g) =>
          (catalogue.data ?? [])
            .filter((s) => s.group === g)
            .map((s) => (
              <Choice
                key={s.code}
                title={s.routing === 'coming_soon' ? `${s.name} · coming soon` : s.name}
                detail={s.blurb}
                selected={false}
                disabled={s.routing === 'coming_soon' || place === null}
                onPress={() => {
                  setError(null);
                  setService(s);
                }}
              />
            )),
        )}
      </Section>

      {service === null || place === null ? null : (
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
