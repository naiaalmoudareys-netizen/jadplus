/**
 * "Set delivery date" on a furnishing job (ADR 0034; S4: the delivery date in writing), once the owner has approved
 * the quote: a day from today on, a time window, and the reason when the date changes (the owner sees it). The
 * API decides when it is allowed (canSetDelivery); nothing shows otherwise, except a date already set.
 */
import { VISIT_SLOTS, dubaiDate, type VisitSlot } from '@jadplus/shared';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { requestProject, setDelivery } from '../api/managed.js';
import { useLang } from '../i18n/I18nProvider.js';
import { visitSlotLabel } from '../i18n/sharedLabels.js';
import { deliveryDays, deliveryFormProblem, deliveryLines } from '../managed/logic.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Card, Eyebrow, Field, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import { dayLabel } from './format.js';

export function DeliverySection({ jobId }: { jobId: string }): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const { t, locale } = lang;
  const load = useCallback(() => requestProject(api, jobId), [api, jobId]);
  const project = useLoad(load);
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [pickedSlot, setSlot] = useState<VisitSlot | null>(null);
  const [reason, setReason] = useState('');
  const p = project.data;
  if (p === null || (p.delivery === null && !p.canSetDelivery)) return null;
  const today = dubaiDate(Date.now());
  const current = p.delivery;
  const days = deliveryDays(today, current?.date ?? null);
  const chosen = day ?? current?.date ?? days[0] ?? today;
  const slot = pickedSlot ?? current?.slot ?? 'morning';
  const problem = deliveryFormProblem(current, { date: chosen, slot, reason }, today);

  const submit = () => {
    const text = reason.trim();
    void action.run(
      () =>
        setDelivery(api, jobId, {
          date: chosen,
          slot,
          reason: current === null || text === '' ? null : text,
        }),
      () => {
        setOpen(false);
        setSaved(true);
        setReason('');
        void project.reload();
      },
    );
  };

  return (
    <Card>
      <Eyebrow>{t('delivery.title')}</Eyebrow>
      {deliveryLines(p, lang).map((line) => (
        <Body key={line}>{line}</Body>
      ))}
      {saved ? <Notice>{t('delivery.saved')}</Notice> : null}
      {!p.canSetDelivery ? null : open ? (
        <View style={styles.box}>
          <Eyebrow>{t('delivery.day')}</Eyebrow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {days.map((d) => (
              <Choice
                key={d}
                compact
                title={dayLabel(d, locale)}
                selected={d === chosen}
                onPress={() => {
                  setDay(d);
                }}
              />
            ))}
          </ScrollView>
          <Eyebrow>{t('delivery.time')}</Eyebrow>
          <View style={styles.row}>
            {VISIT_SLOTS.map((s) => (
              <View key={s.key} style={styles.third}>
                <Choice
                  compact
                  title={visitSlotLabel(s.key, t)}
                  detail={s.hours}
                  selected={s.key === slot}
                  onPress={() => {
                    setSlot(s.key);
                  }}
                />
              </View>
            ))}
          </View>
          {current === null ? null : (
            <Field label={t('delivery.reason')} value={reason} onChangeText={setReason} maxLength={300} />
          )}
          {problem === null || problem === 'delivery.day' ? null : <Body muted>{t(problem)}</Body>}
          <Button
            title={t('delivery.save')}
            busy={action.busy}
            disabled={problem !== null}
            onPress={submit}
          />
          <Button
            title={t('delivery.close')}
            kind="secondary"
            disabled={action.busy}
            onPress={() => {
              setOpen(false);
            }}
          />
          {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
        </View>
      ) : (
        <Button
          title={t(current === null ? 'delivery.set' : 'delivery.change')}
          onPress={() => {
            setSaved(false);
            setOpen(true);
          }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  third: { flex: 1, minWidth: 96 },
});
