/**
 * Report an emergency (E1, E2, E12, E14, L3). Only a water leak or an AC failure (ADR 0017). The app gives no
 * instructions: it asks what is happening and where, then shows the API's exact confirmation ("Your emergency
 * has been sent to …", ADR 0020). For water coming from outside the home, it also shows the building's security
 * and management numbers to call directly, before and after sending (E12, ADR 0029); the report still goes to
 * JAD+ as before.
 */
import type { EmergencyRaised, FaultSource, MyPlace, RaisableEmergencyType } from '@jadplus/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { errorText } from '../src/api/client.js';
import { myPlaces, raiseEmergency } from '../src/api/endpoints.js';
import { asksWhereFrom, emergencyOptions, faultSourceOptions } from '../src/emergency/options.js';
import { OutsideHomeHelp } from '../src/building/HelpLines.js';
import { showsBuildingCalls } from '../src/building/lines.js';
import { confirmationText } from '../src/emergency/confirmation.js';
import { useT } from '../src/i18n/I18nProvider.js';
import { placeLabel } from '../src/jobs/format.js';
import { useSession, useSessionController } from '../src/session/SessionProvider.js';
import { useLoad } from '../src/ui/hooks.js';
import { Body, Button, Field, Heading, Loading, Notice, Page } from '../src/ui/kit.js';
import { colors, fonts, radius, space } from '../src/ui/theme.js';

function Choice(props: { label: string; selected?: boolean; onPress: () => void }): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected === true }}
      onPress={props.onPress}
      style={[styles.choice, props.selected === true && styles.chosen]}
    >
      <Text style={styles.choiceText}>{props.label}</Text>
    </Pressable>
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
  const [type, setType] = useState<RaisableEmergencyType | null>(null);
  const [source, setSource] = useState<FaultSource>('unit');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ raised: EmergencyRaised; outside: boolean } | null>(null);

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (places.loading && places.data === null) return <Loading />;

  const list = places.data ?? [];
  const place = chosenPlace ?? (list.length === 1 ? (list[0] ?? null) : null);

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
      setSent({ raised: result, outside: showsBuildingCalls(type, source) });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (sent !== null) {
    return (
      <Page>
        <Heading>{t('req.emergency.sent')}</Heading>
        <Text style={styles.confirmation} accessibilityLiveRegion="assertive">
          {confirmationText(sent.raised.confirmation, t)}
        </Text>
        <Body muted>{t('req.emergency.reference', { ref: sent.raised.ref })}</Body>
        {sent.outside ? <OutsideHomeHelp location={place?.location ?? null} /> : null}
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
      <Heading>{t('req.emergency.what')}</Heading>
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
      {list.length === 0 ? <Notice tone="error">{t('req.emergency.noHome')}</Notice> : null}
      {list.length > 1 ? (
        <>
          <Body>{t('req.emergency.where')}</Body>
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
          <Body>{t('req.emergency.waterFrom')}</Body>
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
          {showsBuildingCalls(type, source) ? <OutsideHomeHelp location={place?.location ?? null} /> : null}
        </>
      ) : null}
      {type === null ? null : (
        <>
          <Field
            label={t('req.emergency.describe')}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
          <Button
            title={t('req.emergency.send')}
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
  choiceText: { fontSize: 18, fontFamily: fonts.regular, color: colors.text },
  confirmation: {
    fontSize: 22,
    lineHeight: 30,
    fontFamily: fonts.semibold,
    color: colors.navy,
  },
});
