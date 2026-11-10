/**
 * New request (ADR 0012): the owner picks a service from the catalogue (S1), the residence if they have more
 * than one, and says what they need. Services without a signed partner show "coming soon" and cannot be
 * chosen (S2: no promise). The answer says who has the request: the partner company or the JAD+ team.
 */
import { SERVICE_GROUPS, type MyPlace, type RequestRaised, type ServiceView } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ApiError } from '../src/api/client.js';
import { myPlaces, raiseRequest, services } from '../src/api/endpoints.js';
import { placeLabel } from '../src/jobs/format.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Eyebrow, Field, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { buttonRadius, colors, fonts, space } from '../src/ui/theme.js';

function Choice(props: {
  title: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}): ReactNode {
  const off = props.disabled === true;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected, disabled: off }}
      disabled={off}
      onPress={props.onPress}
      style={[styles.choice, props.selected && styles.chosen, off && styles.off]}
    >
      <Text style={[styles.choiceTitle, props.selected && styles.chosenText]}>{props.title}</Text>
      {props.detail === undefined ? null : <Text style={styles.choiceDetail}>{props.detail}</Text>}
    </Pressable>
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
  const [service, setService] = useState<ServiceView | null>(null);
  const [chosenPlace, setChosenPlace] = useState<MyPlace | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<RequestRaised | null>(null);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if ((catalogue.loading && catalogue.data === null) || (places.loading && places.data === null)) {
    return <Loading />;
  }
  const homes = places.data ?? [];
  const place = chosenPlace ?? (homes.length === 1 ? (homes[0] ?? null) : null);

  const send = async () => {
    if (service === null || place === null) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await raiseRequest(api, place, { serviceCode: service.code, description: description.trim() }));
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
        <Text style={styles.confirmation}>{`Your request has been sent to ${sent.sentTo}.`}</Text>
        <Body muted>{`Reference ${sent.ref}. You will see every update in Requests.`}</Body>
        <Button
          title="Follow this request"
          onPress={() => {
            router.replace({ pathname: '/request/[id]', params: { id: sent.requestId } });
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <Heading>What do you need?</Heading>
      {catalogue.error === null ? null : <Notice tone="error">{catalogue.error}</Notice>}
      {SERVICE_GROUPS.map((group) => {
        const inGroup = (catalogue.data ?? []).filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        return (
          <Section key={group} title={group}>
            {inGroup.map((s) => (
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
            ))}
          </Section>
        );
      })}
      {homes.length > 1 ? (
        <Section title="Which residence?">
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
      ) : null}
      {homes.length === 0 ? (
        <Notice tone="error">
          No residence is linked to your account yet. Please contact the JAD+ desk.
        </Notice>
      ) : null}
      {service === null ? null : (
        <>
          <Field
            label="Tell us what you need"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
          <Button
            title={`Send to ${service.routing === 'partner' ? 'our partner' : 'the JAD+ team'}`}
            busy={busy}
            disabled={place === null || description.trim() === ''}
            onPress={() => void send()}
          />
        </>
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  choice: {
    backgroundColor: colors.card,
    borderRadius: buttonRadius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: 2,
  },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  off: { opacity: 0.5 },
  choiceTitle: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  chosenText: { color: colors.slate },
  choiceDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  confirmation: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.navy },
});
