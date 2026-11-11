/**
 * "Your handover" on My unit (O2; ADR 0033): the checklist from completion to key collection for the unit shown,
 * once the handover team has opened it. Each step shows done (with the date) or to do, and the team's note. The
 * key collection appointment is booked by the team; the owner asks to change it by writing on the handover
 * request (all contact through JAD+, ADR 0009). Nothing is shown for a unit without a checklist.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Card, Eyebrow, Heading } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { myHandovers } from './api.js';
import {
  appointmentLine,
  canAskToChange,
  handoverForUnit,
  progressLine,
  stepLines,
  type StepLine,
} from './logic.js';

function Step({ line, extra }: { line: StepLine; extra: ReactNode }): ReactNode {
  return (
    <View style={styles.step}>
      <Ionicons
        name={line.done ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={line.done ? colors.ok : colors.muted}
      />
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{line.title}</Text>
        <Body muted>{line.state}</Body>
        {line.note === null ? null : <Body>{line.note}</Body>}
        {extra}
      </View>
    </View>
  );
}

export function HandoverSection({ unitName }: { unitName: string | null }): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const { t } = lang;
  const router = useRouter();
  const load = useCallback(() => myHandovers(api), [api]);
  const handovers = useLoad(load);
  const h = handoverForUnit(handovers.data ?? [], unitName);
  if (h === null) return null;
  const appointment = appointmentLine(h.appointment, lang);
  const extraFor = (line: StepLine): ReactNode => {
    if (line.step === 'snagging' && !line.done && h.completedAt === null) {
      return (
        <Button
          title={t('handover.bookSnagging')}
          kind="secondary"
          onPress={() => {
            router.push('/new-request');
          }}
        />
      );
    }
    if (line.step !== 'key_appointment') return null;
    return (
      <>
        <Text style={styles.appointment}>{appointment ?? t('handover.noAppointment')}</Text>
        {canAskToChange(h) ? (
          <>
            <Body muted>{t('handover.changeNote')}</Body>
            <Button
              title={t('handover.changeAppointment')}
              kind="secondary"
              onPress={() => {
                router.push({ pathname: '/request/[id]', params: { id: h.requestId } });
              }}
            />
          </>
        ) : null}
      </>
    );
  };
  return (
    <View style={styles.section}>
      <Heading>{t('handover.title')}</Heading>
      <Card>
        <Eyebrow>{progressLine(h, lang)}</Eyebrow>
        <Body muted>{t('handover.intro')}</Body>
        {stepLines(h, lang).map((line) => (
          <Step key={line.step} line={line} extra={extraFor(line)} />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  step: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  stepText: { flex: 1, gap: space.xs },
  stepTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.navy },
  appointment: { fontFamily: fonts.semibold, fontSize: 15, color: colors.slate },
});
