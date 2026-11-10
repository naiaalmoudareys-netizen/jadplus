/**
 * U5 (ADR 0021): extending a tenancy in one tap, +6 months or +1 year from the current end, or to another
 * date typed as YYYY-MM-DD (checked with the API's own rule, extensionAllowed). Also brings back a tenancy
 * that ended on its date.
 */
import type { OwnerTenancy } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { extendTenancy } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { Button, Field, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import { extensionChoices, extensionProblem } from './logic.js';

export function ExtendTenancy(props: {
  tenancy: OwnerTenancy;
  today: string;
  onExtended: (endsOn: string) => void;
  onClose: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const { t, locale } = useLang();
  const action = useAction();
  const [other, setOther] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const currentEnd = props.tenancy.endsOn;

  const extend = (endsOn: string) => {
    void action.run(
      () => extendTenancy(api, props.tenancy.id, endsOn),
      () => {
        props.onExtended(endsOn);
      },
    );
  };
  const extendToOther = () => {
    const typed = (other ?? '').trim();
    const wrong = extensionProblem(currentEnd, typed, props.today);
    setProblem(wrong === null ? null : t(wrong));
    if (wrong === null) extend(typed);
  };

  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      {extensionChoices(currentEnd, props.today).map((c) => (
        <Choice
          key={c.months}
          title={t(c.key)}
          detail={t('tenancy.extendUntil', { date: longDate(c.endsOn, locale) })}
          selected={false}
          disabled={action.busy}
          onPress={() => {
            extend(c.endsOn);
          }}
        />
      ))}
      {other === null ? (
        <Choice
          title={t('tenancy.otherDate')}
          selected={false}
          disabled={action.busy}
          onPress={() => {
            setOther('');
          }}
        />
      ) : (
        <>
          <Field
            label={t('tenancy.newEnd')}
            value={other}
            onChangeText={setOther}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            placeholder={currentEnd}
          />
          <Button title={t('tenancy.extendTo')} busy={action.busy} onPress={extendToOther} />
        </>
      )}
      {problem === null ? null : <Notice tone="error">{problem}</Notice>}
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      <Button title={t('tenancy.keep')} kind="secondary" disabled={action.busy} onPress={props.onClose} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
