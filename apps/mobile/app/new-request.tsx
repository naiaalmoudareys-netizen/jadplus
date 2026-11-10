/**
 * New request (ADR 0012, 0013): the owner picks the residence (always shown, so it is clear), the service (S1;
 * "coming soon" ones cannot be chosen, S2), a working day in the next two weeks and a time window, says what
 * they need, and may add up to 3 photos. The answer names who has the request: the partner company or the
 * JAD+ team. Photos are re-saved on the phone without location data before they are sent.
 */
import {
  DEFAULT_CALENDAR,
  MAX_REQUEST_PHOTOS,
  SERVICE_GROUPS,
  VISIT_SLOTS,
  dubaiDate,
  preferredDays,
  type MyPlace,
  type RequestRaised,
  type ServiceView,
  type VisitSlot,
} from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client.js';
import { addRequestPhoto, myPlaces, raiseRequest, services } from '../src/api/endpoints.js';
import { dayLabel, placeLabel } from '../src/jobs/format.js';
import { pickPhoto, preparePhoto, type PickedPhoto } from '../src/requests/photoPicker.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Eyebrow, Field, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { buttonRadius, colors, fonts, radius, space } from '../src/ui/theme.js';

function Choice(props: {
  title: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void;
}): ReactNode {
  const off = props.disabled === true;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected, disabled: off }}
      disabled={off}
      onPress={props.onPress}
      style={[
        styles.choice,
        props.compact === true && styles.compact,
        props.selected && styles.chosen,
        off && styles.off,
      ]}
    >
      <Text style={[styles.choiceTitle, props.selected && styles.chosenText]}>{props.title}</Text>
      {props.detail === undefined ? null : <Text style={styles.choiceDetail}>{props.detail}</Text>}
    </Pressable>
  );
}

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
  const loadServices = useCallback(() => services(api), [api]);
  const catalogue = useLoad(loadServices);
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const [chosenPlace, setChosenPlace] = useState<MyPlace | null>(null);
  const [service, setService] = useState<ServiceView | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<VisitSlot | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ raised: RequestRaised; photoProblem: boolean } | null>(null);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if ((catalogue.loading && catalogue.data === null) || (places.loading && places.data === null)) {
    return <Loading />;
  }
  const homes = places.data ?? [];
  const place = chosenPlace ?? homes[0] ?? null;
  const days = preferredDays(dubaiDate(Date.now()), DEFAULT_CALENDAR);
  const ready =
    place !== null && service !== null && day !== null && slot !== null && description.trim() !== '';

  const addPhoto = async (source: 'camera' | 'library') => {
    const picked = await pickPhoto(source);
    if (picked !== null) setPhotos((p) => [...p, picked].slice(0, MAX_REQUEST_PHOTOS));
  };

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const raised = await raiseRequest(api, place, {
        serviceCode: service.code,
        description: description.trim(),
        preferredDate: day,
        preferredSlot: slot,
      });
      // The request is saved first; a photo that fails does not lose the request.
      let photoProblem = false;
      for (const photo of photos) {
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

      <Section title="Which residence?">
        {homes.length === 0 ? (
          <Notice tone="error">
            No residence is linked to your account yet. Please contact the JAD+ desk.
          </Notice>
        ) : null}
        {homes.map((p) => (
          <Choice
            key={p.sfUnitId ?? p.tenancyId ?? ''}
            title={placeLabel(p.location)}
            selected={place === p}
            onPress={() => {
              setChosenPlace(p);
            }}
          />
        ))}
      </Section>

      <Section title="What do you need?">
        {catalogue.error === null ? null : <Notice tone="error">{catalogue.error}</Notice>}
        {SERVICE_GROUPS.map((group) =>
          (catalogue.data ?? [])
            .filter((s) => s.group === group)
            .map((s) => (
              <Choice
                key={s.code}
                title={s.routing === 'coming_soon' ? `${s.name} · coming soon` : s.name}
                detail={s.blurb}
                selected={service?.code === s.code}
                disabled={s.routing === 'coming_soon'}
                onPress={() => {
                  setService(s);
                }}
              />
            )),
        )}
      </Section>

      <Section title="Which day suits you?">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {days.map((d) => (
            <Choice
              key={d}
              compact
              title={dayLabel(d)}
              selected={day === d}
              onPress={() => {
                setDay(d);
              }}
            />
          ))}
        </ScrollView>
      </Section>

      <Section title="What time?">
        {VISIT_SLOTS.map((s) => (
          <Choice
            key={s.key}
            title={s.label}
            detail={s.hours}
            selected={slot === s.key}
            onPress={() => {
              setSlot(s.key);
            }}
          />
        ))}
      </Section>

      <Section title="Tell us what you need">
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />
      </Section>

      <Section title={`Photos (optional, up to ${String(MAX_REQUEST_PHOTOS)})`}>
        {photos.length === 0 ? null : (
          <View style={styles.row}>
            {photos.map((p, i) => (
              <Pressable
                key={p.uri}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${String(i + 1)}`}
                onPress={() => {
                  setPhotos((all) => all.filter((x) => x !== p));
                }}
              >
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                <Text style={styles.remove}>REMOVE</Text>
              </Pressable>
            ))}
          </View>
        )}
        {photos.length < MAX_REQUEST_PHOTOS ? (
          <View style={styles.row}>
            <View style={styles.half}>
              <Button title="Take photo" kind="secondary" onPress={() => void addPhoto('camera')} />
            </View>
            <View style={styles.half}>
              <Button title="Choose photo" kind="secondary" onPress={() => void addPhoto('library')} />
            </View>
          </View>
        ) : null}
      </Section>

      <Button
        title={
          service === null
            ? 'Send request'
            : `Send to ${service.routing === 'partner' ? 'our partner' : 'the JAD+ team'}`
        }
        busy={busy}
        disabled={!ready}
        onPress={() => void send()}
      />
      {ready ? null : (
        <Body muted>Choose the residence, service, day and time, and describe what you need.</Body>
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  half: { flex: 1, minWidth: 140 },
  choice: {
    backgroundColor: colors.card,
    borderRadius: buttonRadius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 2,
  },
  compact: { paddingVertical: 12, paddingHorizontal: 14 },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  off: { opacity: 0.5 },
  choiceTitle: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  chosenText: { color: colors.slate },
  choiceDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  thumb: { width: 96, height: 96, borderRadius: radius, backgroundColor: colors.backgroundAlt },
  remove: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.urgent,
    marginTop: 4,
  },
  confirmation: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.navy },
});
