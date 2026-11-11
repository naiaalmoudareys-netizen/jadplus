/**
 * The pop-up for a consultation service (ADR 0031; O5): property management, leasing, resale, mortgage, Golden
 * Visa. Instead of a visit it asks the best time to call (working day + window), the service's 1-3 short questions,
 * a short note, and the REQUIRED switch "Share my name, unit and contact details with [provider] so they can
 * contact me". Send stays disabled until every question is answered, a time is chosen and sharing is on. Owners
 * only (tenants never see these services, R2).
 */
import {
  CONSULTATION_CONSENT_VERSION,
  VISIT_SLOTS,
  dubaiDate,
  isConsultationService,
  preferredDays,
  questionsFor,
  type ConsultationQuestion,
  type ConsultationRaised,
  type MyPlace,
  type ServiceView,
  type VisitSlot,
} from '@jadplus/shared';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api/client.js';
import { consultationProvider, raiseConsultation } from '../api/consultation.js';
import { dayLabel } from '../jobs/format.js';
import { useLang } from '../i18n/I18nProvider.js';
import { serviceName, visitSlotLabel } from '../i18n/sharedLabels.js';
import { SwitchRow } from '../profile/ProfileParts.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { useWorkingCalendar } from '../ui/calendar.js';
import { useLoad } from '../ui/hooks.js';
import { Button, Eyebrow, Field, Loading, Notice } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { BottomSheet } from './BottomSheet.js';
import { availableFromChoices, optionLabel, questionLabel } from './consultationWords.js';

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.section}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function Question(props: {
  q: ConsultationQuestion;
  value: string | undefined;
  today: string;
  onChoose: (value: string) => void;
}): ReactNode {
  const { t, locale } = useLang();
  const choices =
    props.q.kind === 'choice'
      ? props.q.options.map((o) => ({ id: o.id, title: optionLabel(o.id, o.label, t) }))
      : availableFromChoices(props.today).map((d) => ({
          id: d,
          title: d === props.today ? t('cons.date.now') : dayLabel(d, locale),
        }));
  return (
    <Section title={questionLabel(props.q, t)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {choices.map((c) => (
          <Choice
            key={c.id}
            compact
            title={c.title}
            selected={props.value === c.id}
            onPress={() => {
              props.onChoose(c.id);
            }}
          />
        ))}
      </ScrollView>
    </Section>
  );
}

export function ConsultationSheet(props: {
  service: ServiceView;
  place: MyPlace;
  /** "1204-J188 · J188": which home it is about. */
  placeLabel: string;
  onClose: () => void;
  onSent: (raised: ConsultationRaised) => void;
}): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const today = dubaiDate(Date.now());
  const days = preferredDays(today, useWorkingCalendar());
  const questions = questionsFor(props.service.code);
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({});
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<VisitSlot | null>(null);
  const [note, setNote] = useState('');
  // Which provider the owner agreed to share with: the switch is on only for the provider shown now.
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The consent names the provider who would get the details; the API refuses if it changes before sending.
  const code = props.service.code;
  const loadProvider = useCallback(() => consultationProvider(api, code), [api, code]);
  const loaded = useLoad(loadProvider);
  const provider = loaded.data ?? null;
  const consent = provider !== null && consentFor === provider.id;
  const sfUnitId = props.place.sfUnitId;
  const answered = questions.every((q) => answers[q.id] !== undefined);
  // `consent` is only true with a provider shown.
  const ready = answered && day !== null && slot !== null && consent && sfUnitId !== null;

  const send = async () => {
    if (!ready || busy || !isConsultationService(code)) return;
    setBusy(true);
    setError(null);
    try {
      const text = note.trim();
      const raised = await raiseConsultation(api, {
        sfUnitId,
        serviceCode: code,
        answers,
        bestDate: day,
        bestSlot: slot,
        providerId: provider.id,
        consent: true,
        consentVersion: CONSULTATION_CONSENT_VERSION,
        ...(text === '' ? {} : { note: text }),
      });
      props.onSent(raised);
    } catch (err) {
      setError(errorText(err, t, 'req.sendFailed'));
      setBusy(false);
      // If the company changed meanwhile, its new name shows and the switch is off until agreed again.
      void loaded.reload();
    }
  };

  return (
    <BottomSheet
      title={serviceName(props.service.code, props.service.name, t)}
      subtitle={props.placeLabel}
      busy={busy}
      onClose={props.onClose}
    >
      {loaded.loading && loaded.data === null ? <Loading /> : null}
      {loaded.error === null ? null : <Notice tone="error">{loaded.error}</Notice>}
      {questions.map((q) => (
        <Question
          key={q.id}
          q={q}
          value={answers[q.id]}
          today={today}
          onChoose={(value) => {
            setAnswers((a) => ({ ...a, [q.id]: value }));
          }}
        />
      ))}
      <Section title={t('cons.sheet.callTime')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {days.map((d) => (
            <Choice
              key={d}
              compact
              title={dayLabel(d, locale)}
              selected={day === d}
              onPress={() => {
                setDay(d);
              }}
            />
          ))}
        </ScrollView>
        <View style={styles.row}>
          {VISIT_SLOTS.map((s) => (
            <View key={s.key} style={styles.third}>
              <Choice
                compact
                title={visitSlotLabel(s.key, t)}
                detail={s.hours}
                selected={slot === s.key}
                onPress={() => {
                  setSlot(s.key);
                }}
              />
            </View>
          ))}
        </View>
      </Section>
      <Field label={t('cons.sheet.note')} value={note} onChangeText={setNote} multiline maxLength={500} />
      <Section title={t('cons.sheet.share')}>
        {provider === null ? null : (
          <SwitchRow
            icon="shield-checkmark-outline"
            title={t('cons.consent', { provider: provider.name })}
            value={consent}
            onChange={(on) => {
              setConsentFor(on ? provider.id : null);
            }}
          />
        )}
      </Section>
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      <Button title={t('cons.sheet.send')} busy={busy} disabled={!ready} onPress={() => void send()} />
      {ready ? null : <Text style={styles.hint}>{t('cons.sheet.hint')}</Text>}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  third: { flex: 1, minWidth: 96 },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
