/**
 * The one "Next step" at the top of a job (R3; ADR 0018): a single clear button for the first thing the partner
 * has to do now (partner/logic.ts nextStep). "I'm on my way" (A8) and "Start work" happen with one tap here;
 * the steps that need a form (acknowledge, book the visit, finish the work) take the partner to that form.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { onMyWay, startWork } from '../api/endpoints.js';
import type { MessageKey } from '../i18n/dictionary.js';
import { useT } from '../i18n/I18nProvider.js';
import type { NextStep as Step } from '../partner/logic.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Eyebrow, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { cardShadow, colors, radius, space } from '../ui/theme.js';

const TITLES: Readonly<Record<Step, MessageKey>> = {
  acknowledge: 'partner.next.acknowledge',
  book_visit: 'partner.next.book',
  on_my_way: 'partner.next.onMyWay',
  start_work: 'partner.next.start',
  work_done: 'partner.next.finish',
};

export function NextStep(props: {
  step: Step;
  jobId: string;
  /** Scrolls to the step's form. */
  onGo: () => void;
  onDone: () => void;
}): ReactNode {
  const t = useT();
  const { api } = useSessionController();
  const action = useAction();
  const { step, jobId } = props;
  const press = () => {
    if (step === 'on_my_way') void action.run(() => onMyWay(api, jobId), props.onDone);
    else if (step === 'start_work') void action.run(() => startWork(api, jobId), props.onDone);
    else props.onGo();
  };
  return (
    <View style={[styles.card, step === 'acknowledge' && styles.urgent]}>
      <Eyebrow>{t('partner.next')}</Eyebrow>
      <Button title={t(TITLES[step])} busy={action.busy} onPress={press} />
      {step === 'on_my_way' ? <Body muted>{t('extras.onMyWayNote')}</Body> : null}
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  urgent: { borderColor: colors.urgent, borderWidth: 2 },
});
