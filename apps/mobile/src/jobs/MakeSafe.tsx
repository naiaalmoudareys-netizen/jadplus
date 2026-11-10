/**
 * Urgent make-safe work on an emergency (E8; ADR 0019): the amount and what was done, recorded without a quote
 * when it is within the owner's pre-agreed limit. The API decides: when the owner set no limit or the amount
 * is above it, its answer is shown as it is, with a way to send a quote instead.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '../api/client.js';
import { makeSafe } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Field, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';
import { parseAed } from './journey.js';

const CONFLICT = 409;

export function MakeSafe(props: {
  jobId: string;
  /** Present when the partner may send a quote now: offered when the API refuses the amount. */
  onQuote: (() => void) | null;
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [problem, setProblem] = useState<'amount' | 'scope' | null>(null);
  const [refused, setRefused] = useState(false);

  const send = () => {
    const value = parseAed(amount);
    const text = scope.trim();
    const missing = value === null ? 'amount' : text === '' ? 'scope' : null;
    setProblem(missing);
    setRefused(false);
    if (value === null || missing !== null) return;
    void action.run(async () => {
      try {
        await makeSafe(api, props.jobId, { amountAed: value, scope: text });
      } catch (err) {
        // No limit, or above it: the API's own message says so; a quote is the way forward.
        if (err instanceof ApiError && err.status === CONFLICT) setRefused(true);
        throw err;
      }
    }, props.onDone);
  };

  return (
    <View style={styles.box}>
      <Body muted>{t('extras.makeSafe.explain')}</Body>
      <Field
        label={t('journey.quote.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <Field
        label={t('extras.makeSafe.scope')}
        value={scope}
        onChangeText={setScope}
        multiline
        maxLength={2000}
      />
      {problem === null ? null : (
        <Notice tone="error">
          {problem === 'amount' ? t('journey.quote.badAmount') : t('extras.makeSafe.needScope')}
        </Notice>
      )}
      <Button title={t('extras.makeSafe.send')} busy={action.busy} onPress={send} />
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      {refused && props.onQuote !== null ? (
        <Button title={t('extras.makeSafe.toQuote')} kind="secondary" onPress={props.onQuote} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
