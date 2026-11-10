/**
 * Report an emergency (E1-E3, E12, E14, L3). The app gives no instructions: it asks what is happening and
 * where, then shows the API's exact confirmation ("Your emergency has been sent to …"). Fire, smoke, gas or
 * injury shows only the emergency numbers at once (E3); JAD+ is alerted in the background.
 */
import type { EmergencyRaised, EmergencyType, FaultSource, LifeSafetyType, MyPlace } from '@jadplus/shared';
import { EMERGENCY_NUMBERS } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { ApiError } from '../src/api/client.js';
import { myPlaces, raiseEmergency } from '../src/api/endpoints.js';
import {
  asksWhereFrom,
  callLink,
  emergencyOptions,
  faultSourceOptions,
  lifeSafetyOptions,
  lifeSafetyReport,
} from '../src/emergency/options.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { placeLabel } from '../src/jobs/format.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Field, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, radius, space } from '../src/ui/theme.js';

function Choice(props: {
  label: string;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected === true }}
      onPress={props.onPress}
      style={[
        styles.choice,
        props.danger === true && styles.danger,
        props.selected === true && styles.chosen,
      ]}
    >
      <Text style={[styles.choiceText, props.danger === true && styles.dangerText]}>{props.label}</Text>
    </Pressable>
  );
}

function Numbers({ alertFailed }: { alertFailed: boolean }): ReactNode {
  return (
    <Page>
      <Heading>Call emergency services</Heading>
      {EMERGENCY_NUMBERS.map((n) => (
        <Button
          key={n.number}
          kind="danger"
          title={`Call ${n.number} · ${n.label}`}
          onPress={() => void Linking.openURL(callLink(n.number))}
        />
      ))}
      {alertFailed ? (
        <Notice tone="error">JAD+ could not be alerted. Please call the numbers above.</Notice>
      ) : null}
    </Page>
  );
}

export default function Emergency(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const t = useT();
  const loadPlaces = useCallback(() => myPlaces(api), [api]);
  const places = useLoad(loadPlaces);
  const [chosenPlace, setChosenPlace] = useState<MyPlace | null>(null);
  const [type, setType] = useState<EmergencyType | null>(null);
  const [source, setSource] = useState<FaultSource>('unit');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lifeSafety, setLifeSafety] = useState<{ alertFailed: boolean } | null>(null);
  const [sent, setSent] = useState<Extract<EmergencyRaised, { confirmation: string }> | null>(null);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (lifeSafety !== null) return <Numbers alertFailed={lifeSafety.alertFailed} />;
  if (places.loading && places.data === null) return <Loading />;

  const list = places.data ?? [];
  const place = chosenPlace ?? (list.length === 1 ? (list[0] ?? null) : null);

  const reportLifeSafety = (value: LifeSafetyType) => {
    // E3: the numbers come first, before anything else can go wrong.
    setLifeSafety({ alertFailed: false });
    // Someone with several homes may not have chosen one yet: alert JAD+ about the first rather than none.
    const target = place ?? list[0] ?? null;
    if (target === null) {
      setLifeSafety({ alertFailed: true });
      return;
    }
    raiseEmergency(api, target, {
      type: value,
      faultSource: 'unit',
      description: lifeSafetyReport(value),
    }).catch(() => {
      setLifeSafety({ alertFailed: true });
    });
  };

  const submit = async () => {
    if (place === null || type === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await raiseEmergency(api, place, {
        type,
        faultSource: asksWhereFrom(type) ? source : 'unit',
        description: description.trim(),
      });
      if ('confirmation' in result) setSent(result);
      else setLifeSafety({ alertFailed: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent !== null) {
    return (
      <Page>
        <Heading>Emergency sent</Heading>
        <Text style={styles.confirmation} accessibilityLiveRegion="assertive">
          {sent.confirmation}
        </Text>
        <Body muted>Reference {sent.ref}</Body>
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
      <Heading>What is happening?</Heading>
      {lifeSafetyOptions(t).map((o) => (
        <Choice
          key={o.value}
          label={o.label}
          danger
          onPress={() => {
            reportLifeSafety(o.value);
          }}
        />
      ))}
      {emergencyOptions(t).map((o) => (
        <Choice
          key={o.value}
          label={o.label}
          selected={type === o.value}
          onPress={() => {
            setType(o.value);
          }}
        />
      ))}
      {list.length === 0 ? (
        <Notice tone="error">No home is linked to your account yet. Please contact JAD+.</Notice>
      ) : null}
      {list.length > 1 ? (
        <>
          <Body>Where?</Body>
          {list.map((p) => (
            <Choice
              key={p.sfUnitId ?? p.tenancyId ?? ''}
              label={placeLabel(p.location, t)}
              selected={place === p}
              onPress={() => {
                setChosenPlace(p);
              }}
            />
          ))}
        </>
      ) : null}
      {type !== null && asksWhereFrom(type) ? (
        <>
          <Body>Where is the water coming from?</Body>
          {faultSourceOptions(t).map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={source === o.value}
              onPress={() => {
                setSource(o.value);
              }}
            />
          ))}
        </>
      ) : null}
      {type === null ? null : (
        <>
          <Field
            label="What do you see? (short)"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
          <Button
            title="Send emergency"
            kind="danger"
            busy={busy}
            disabled={place === null || description.trim() === ''}
            onPress={() => void submit()}
          />
        </>
      )}
      {error === null ? null : <Notice tone="error">{error}</Notice>}
    </Page>
  );
}

const styles = StyleSheet.create({
  choice: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  danger: { backgroundColor: colors.urgentSoft, borderColor: colors.urgent },
  choiceText: { fontSize: 18, fontFamily: fonts.regular, color: colors.text },
  dangerText: { color: colors.urgent, fontFamily: fonts.semibold },
  confirmation: {
    fontSize: 22,
    lineHeight: 30,
    fontFamily: fonts.semibold,
    color: colors.navy,
  },
});
