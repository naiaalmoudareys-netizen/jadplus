/**
 * R2 (ADR 0021): the owner invites a tenant to one residence, inline on My unit: the tenant's name, their
 * email or mobile (a two-way switch; the tenant signs in with it), and the dates. The dates are typed as
 * YYYY-MM-DD (no date-picker dependency) with one-tap lengths of 6 months, 1 year and 2 years, and checked
 * with the same rule as the API (tenancyDatesAllowed) before anything is sent.
 */
import { maskContact } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { inviteTenant } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { Body, Button, Card, Eyebrow, Field, Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import {
  LENGTH_CHOICES,
  LENGTH_KEYS,
  datesProblem,
  defaultDates,
  endAfter,
  isIsoDate,
  periodText,
} from './logic.js';

type ContactKind = 'email' | 'phone';

export function InviteTenant(props: {
  sfUnitId: string;
  today: string;
  onSent: (sent: { name: string; contact: string }) => void;
  onClose: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const { t } = lang;
  const action = useAction();
  const first = defaultDates(props.today);
  const [name, setName] = useState('');
  const [by, setBy] = useState<ContactKind>('email');
  const [contact, setContact] = useState('');
  const [startsOn, setStartsOn] = useState(first.startsOn);
  const [endsOn, setEndsOn] = useState(first.endsOn);
  const [problem, setProblem] = useState<string | null>(null);

  const datesWrong = datesProblem(startsOn, endsOn, props.today);
  const send = () => {
    const tenant = name.trim();
    const typed = contact.trim();
    const wrong =
      tenant.length < 2
        ? t('tenancy.badName')
        : typed === ''
          ? t('tenancy.badContact')
          : datesWrong === null
            ? null
            : t(datesWrong);
    setProblem(wrong);
    if (wrong !== null) return;
    const body = {
      sfUnitId: props.sfUnitId,
      name: tenant,
      ...(by === 'email' ? { email: typed } : { phone: typed }),
      startsOn,
      endsOn,
    };
    void action.run(
      () => inviteTenant(api, body),
      () => {
        props.onSent({ name: tenant, contact: maskContact(typed) });
      },
    );
  };

  return (
    <Card>
      <Eyebrow>{t('tenancy.invite')}</Eyebrow>
      <View style={styles.box}>
        <Field label={t('tenancy.name')} value={name} onChangeText={setName} autoComplete="off" />
        <View style={styles.row} accessibilityRole="radiogroup">
          {(['email', 'phone'] as const).map((kind) => (
            <View key={kind} style={styles.half}>
              <Choice
                compact
                title={t(kind === 'email' ? 'tenancy.byEmail' : 'tenancy.byMobile')}
                selected={by === kind}
                onPress={() => {
                  setBy(kind);
                  setContact('');
                }}
              />
            </View>
          ))}
        </View>
        <Field
          label={t(by === 'email' ? 'tenancy.email' : 'tenancy.mobile')}
          value={contact}
          onChangeText={setContact}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={by === 'email' ? 'email-address' : 'phone-pad'}
          placeholder={by === 'email' ? 'name@example.com' : '+971 50 000 0000'}
        />
        <Field
          label={t('tenancy.startsOnField')}
          value={startsOn}
          onChangeText={setStartsOn}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Eyebrow>{t('tenancy.length')}</Eyebrow>
        <View style={styles.row} accessibilityRole="radiogroup">
          {LENGTH_CHOICES.map((months) => {
            const end = isIsoDate(startsOn) ? endAfter(startsOn, months) : null;
            return (
              <View key={months} style={styles.third}>
                <Choice
                  compact
                  title={t(LENGTH_KEYS[months])}
                  selected={end !== null && end === endsOn}
                  disabled={end === null}
                  onPress={() => {
                    if (end !== null) setEndsOn(end);
                  }}
                />
              </View>
            );
          })}
        </View>
        <Field
          label={t('tenancy.endsOnField')}
          value={endsOn}
          onChangeText={setEndsOn}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        {datesWrong === null ? <Body muted>{periodText(startsOn, endsOn, lang)}</Body> : null}
        {problem === null ? null : <Notice tone="error">{problem}</Notice>}
        {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
        <Button title={t('tenancy.send')} busy={action.busy} onPress={send} />
        <Button title={t('tenancy.notNow')} kind="secondary" disabled={action.busy} onPress={props.onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, marginTop: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  third: { flex: 1 },
});
