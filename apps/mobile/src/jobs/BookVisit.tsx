/**
 * Booking (or changing) the visit (ADR 0018): who is going, which day and which time window. The resident's
 * preferred day and window (ADR 0013) are chosen first when still open; only windows the API accepts are
 * offered (journey.ts slotOpen); the list follows the clock, minute by minute.
 */
import { VISIT_SLOTS, type RequestSummary, type VisitSlot } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { bookVisit } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { visitSlotLabel } from '../i18n/sharedLabels.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { useWorkingCalendar } from '../ui/calendar.js';
import { useNow } from '../ui/hooks.js';
import { Button, Eyebrow, Loading, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';
import { dayLabel } from './format.js';
import { slotOpen, slotWindow, visitDays } from './journey.js';
import { useTechnicians } from './team.js';

type PreferredVisit = NonNullable<RequestSummary['preferredVisit']>;

function firstOpenSlot(day: string, now: number, wanted: VisitSlot | null): VisitSlot | null {
  if (wanted !== null && slotOpen(day, wanted, now)) return wanted;
  return VISIT_SLOTS.find((s) => slotOpen(day, s.key, now))?.key ?? null;
}

export function BookVisit(props: {
  jobId: string;
  preferred: PreferredVisit | null;
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const { team, technicians, technicianId, choose } = useTechnicians();
  const now = useNow(60_000);
  const action = useAction();
  const [pickedDay, setDay] = useState<string | null>(null);
  const [pickedSlot, setSlot] = useState<VisitSlot | null>(null);
  const preferred = props.preferred;
  const days = visitDays(now, preferred?.date ?? null, useWorkingCalendar());
  const day =
    (pickedDay !== null && days.includes(pickedDay) ? pickedDay : null) ??
    (preferred !== null && days.includes(preferred.date) ? preferred.date : null) ??
    days[0] ??
    null;
  const wanted = pickedSlot ?? (preferred !== null && day === preferred.date ? preferred.slot : null);
  const slot = day === null ? null : firstOpenSlot(day, now, wanted);

  const submit = () => {
    if (technicianId === null || day === null || slot === null) return;
    void action.run(
      () => bookVisit(api, props.jobId, { technicianId, ...slotWindow(day, slot) }),
      props.onDone,
    );
  };

  if (team.loading && team.data === null) return <Loading />;
  return (
    <View style={styles.box}>
      <Eyebrow>{t('access.whoIsGoing')}</Eyebrow>
      {technicians.map((tech) => (
        <Choice
          key={tech.id}
          title={tech.self ? t('access.me', { name: tech.name }) : tech.name}
          selected={tech.id === technicianId}
          onPress={() => {
            choose(tech.id);
          }}
        />
      ))}
      {technicians.length === 0 ? <Notice tone="error">{t('access.noTechnician')}</Notice> : null}
      <Eyebrow>{t('journey.book.day')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((d) => (
          <Choice
            key={d}
            compact
            title={dayLabel(d, locale)}
            {...(preferred?.date === d ? { detail: t('journey.book.preferred') } : {})}
            selected={d === day}
            onPress={() => {
              setDay(d);
            }}
          />
        ))}
      </ScrollView>
      <Eyebrow>{t('journey.book.time')}</Eyebrow>
      <View style={styles.row}>
        {VISIT_SLOTS.map((s) => (
          <View key={s.key} style={styles.third}>
            <Choice
              compact
              title={visitSlotLabel(s.key, t)}
              detail={s.hours}
              selected={s.key === slot}
              disabled={day === null || !slotOpen(day, s.key, now)}
              onPress={() => {
                setSlot(s.key);
              }}
            />
          </View>
        ))}
      </View>
      <Button
        title={t('journey.book.send')}
        busy={action.busy}
        disabled={technicianId === null || slot === null}
        onPress={submit}
      />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      {team.error === null ? null : <Notice tone="error">{team.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  third: { flex: 1, minWidth: 96 },
});
