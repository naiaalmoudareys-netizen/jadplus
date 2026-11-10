/**
 * The bar fixed at the bottom of a job (R3): one big button for the next step (partner/logic.ts nextStep) and
 * "More" with the other steps the API allows now (no access, quote, make-safe, change the visit …).
 * "I'm on my way" (A8) and "Start work" run straight away; the other steps open their form in a pop-up.
 * A short confirmation shows once a step went through.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { onMyWay, startWork } from '../api/endpoints.js';
import type { MessageKey } from '../i18n/dictionary.js';
import { useT } from '../i18n/I18nProvider.js';
import type { NextStep } from '../partner/logic.js';
import { isOneTap, type JobForm, type JobStep, type MoreAction, type OneTap } from '../partner/progress.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Button, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { colors, fonts, space } from '../ui/theme.js';
import { doneText, stepTitle } from './JobForms.js';

const PRIMARY_TITLES: Readonly<Record<NextStep, MessageKey>> = {
  acknowledge: 'partner.next.acknowledge',
  book_visit: 'partner.next.book',
  on_my_way: 'partner.next.onMyWay',
  start_work: 'partner.next.start',
  work_done: 'partner.next.finish',
};

export function JobBar(props: {
  jobId: string;
  detail: RequestDetail | null;
  primary: NextStep | null;
  more: readonly MoreAction[];
  /** The step that just went through, shown for a few seconds. */
  confirmed: JobStep | null;
  onForm: (form: JobForm) => void;
  onDone: (step: OneTap) => void;
}): ReactNode {
  const t = useT();
  const { api } = useSessionController();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const { primary, more } = props;

  const go = (step: JobStep) => {
    setOpen(false);
    if (!isOneTap(step)) {
      props.onForm(step);
      return;
    }
    const call = step === 'on_my_way' ? () => onMyWay(api, props.jobId) : () => startWork(api, props.jobId);
    void action.run(call, () => {
      props.onDone(step);
    });
  };

  if (primary === null && more.length === 0 && props.confirmed === null) return null;
  return (
    <View style={styles.bar}>
      {props.confirmed === null ? null : <Notice>{doneText(props.confirmed, t)}</Notice>}
      {open
        ? more.map((step) => (
            <Button
              key={step}
              title={stepTitle(step, props.detail, t)}
              kind="secondary"
              disabled={action.busy}
              onPress={() => {
                go(step);
              }}
            />
          ))
        : null}
      {primary === null ? null : (
        <Button
          title={t(PRIMARY_TITLES[primary])}
          kind={primary === 'acknowledge' ? 'danger' : 'primary'}
          busy={action.busy}
          onPress={() => {
            go(primary);
          }}
        />
      )}
      {primary === 'on_my_way' ? <Text style={styles.note}>{t('extras.onMyWayNote')}</Text> : null}
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      {more.length === 0 ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={() => {
            setOpen((o) => !o);
          }}
          style={styles.more}
        >
          <Text style={styles.moreText}>{t('job.page.more')}</Text>
          <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={18} color={colors.slate} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 44,
  },
  moreText: { fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 1, color: colors.slate },
});
