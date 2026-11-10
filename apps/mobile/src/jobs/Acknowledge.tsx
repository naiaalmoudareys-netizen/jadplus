/**
 * Acknowledging a new emergency (E4): who is going and when they will arrive. Only this partner's active
 * technicians can be chosen (E17); the window choices always satisfy the rules the API applies
 * (packages/shared arrivalChoices / arrivalWindowAllowed).
 */
import { arrivalChoices, type PartnerJob } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api/client.js';
import { acknowledge } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { arrivalChoiceLabel } from '../i18n/sharedLabels.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Loading, Notice } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { useTechnicians } from './team.js';

function Choice(props: { label: string; selected: boolean; onPress: () => void }): ReactNode {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.choice, props.selected && styles.chosen]}
    >
      <Text style={[styles.choiceText, props.selected && styles.chosenText]}>{props.label}</Text>
    </Pressable>
  );
}

export function Acknowledge({ job, onDone }: { job: PartnerJob; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const { team, technicians, technicianId, choose } = useTechnicians();
  const [windowIndex, setWindowIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (technicianId === null) return;
    // Windows are worked out at the moment of sending, so they are never in the past.
    const window = arrivalChoices(Date.now())[windowIndex];
    if (window === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await acknowledge(api, job.id, {
        technicianId,
        arrivalWindowStart: window.start,
        arrivalWindowEnd: window.end,
      });
      onDone();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (team.loading && team.data === null) return <Loading />;
  return (
    <View style={styles.section}>
      <Body>{t('access.whoIsGoing')}</Body>
      {technicians.map((tech) => (
        <Choice
          key={tech.id}
          label={tech.self ? t('access.me', { name: tech.name }) : tech.name}
          selected={tech.id === technicianId}
          onPress={() => {
            choose(tech.id);
          }}
        />
      ))}
      {technicians.length === 0 ? <Notice tone="error">{t('access.noTechnician')}</Notice> : null}
      <Body>{t('access.whenArrive')}</Body>
      {arrivalChoices(Date.now()).map((w, i) => (
        <Choice
          key={w.label}
          label={arrivalChoiceLabel(i, w.label, t)}
          selected={i === windowIndex}
          onPress={() => {
            setWindowIndex(i);
          }}
        />
      ))}
      <Button
        title={t('access.acknowledge')}
        busy={busy}
        disabled={technicianId === null}
        onPress={() => void submit()}
      />
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      {team.error === null ? null : <Notice tone="error">{team.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  choice: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  chosen: { borderColor: colors.slate, borderWidth: 2 },
  choiceText: { fontSize: 18, fontFamily: fonts.regular, color: colors.text },
  chosenText: { fontFamily: fonts.semibold, color: colors.navy },
});
