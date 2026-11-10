/**
 * "I have paid" (ADR 0026): the owner says when they paid the partner (today, yesterday or another date) so the
 * partner is reminded to confirm. JAD+ only records it; the invoice stays unpaid until the partner confirms.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { claimInvoicePaid } from '../api/endpoints.js';
import type { MessageKey } from '../i18n/dictionary.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { Body, Button, Field, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import { paidOnDate, type PaidOnChoice } from './logic.js';

const CHOICES: readonly { readonly choice: PaidOnChoice; readonly key: MessageKey }[] = [
  { choice: 'today', key: 'invoice.today' },
  { choice: 'yesterday', key: 'invoice.yesterday' },
  { choice: 'other', key: 'invoice.otherDate' },
];

export function ClaimPaid(props: { invoiceId: string; today: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PaidOnChoice>('today');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    const picked = paidOnDate(choice, typed, props.today);
    if ('problem' in picked) {
      setProblem(t(picked.problem));
      return;
    }
    setProblem(null);
    void action.run(() => claimInvoicePaid(api, props.invoiceId, picked.date), props.onDone);
  };

  if (!open) {
    return (
      <View style={styles.box}>
        <Button
          title={t('invoice.claim')}
          onPress={() => {
            setOpen(true);
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Body>{t('invoice.claimWhen')}</Body>
      {CHOICES.map((c) => (
        <Choice
          key={c.choice}
          title={t(c.key)}
          selected={choice === c.choice}
          disabled={action.busy}
          compact
          onPress={() => {
            setChoice(c.choice);
            setProblem(null);
          }}
        />
      ))}
      {choice === 'other' ? (
        <Field
          label={t('invoice.dateField')}
          value={typed}
          onChangeText={setTyped}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          placeholder={props.today}
        />
      ) : null}
      {problem === null ? null : <Notice tone="error">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      <Button title={t('invoice.send')} busy={action.busy} onPress={send} />
      <Button
        title={t('common.cancel')}
        kind="secondary"
        disabled={action.busy}
        onPress={() => {
          setOpen(false);
          setProblem(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm, marginTop: space.sm } });
