/**
 * A quote for chargeable work (L4, A2, A3; ADR 0018): the amount in AED and what the work covers. Only the
 * owner can approve it. After a decline the partner may send one revised quote.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { sendQuote } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Field, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';
import { parseAed } from './journey.js';

export function SendQuote(props: { jobId: string; revised: boolean; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [checked, setChecked] = useState(false);
  const amountAed = parseAed(amount);
  const text = scope.trim();

  const submit = () => {
    setChecked(true);
    if (amountAed === null || text === '') return;
    void action.run(() => sendQuote(api, props.jobId, { amountAed, scope: text }), props.onDone);
  };

  return (
    <View style={styles.box}>
      {props.revised ? <Body muted>{t('journey.quote.declinedNote')}</Body> : null}
      <Field
        label={t('journey.quote.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      {checked && amountAed === null ? <Notice tone="error">{t('journey.quote.badAmount')}</Notice> : null}
      <Field
        label={t('journey.quote.scope')}
        value={scope}
        onChangeText={setScope}
        multiline
        maxLength={2000}
      />
      {checked && text === '' ? <Notice tone="error">{t('journey.quote.needScope')}</Notice> : null}
      <Button
        title={props.revised ? t('journey.quote.sendRevised') : t('journey.quote.send')}
        busy={action.busy}
        onPress={submit}
      />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
