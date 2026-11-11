/**
 * The residence's tenant on My unit (ADR 0021; R2, O4, U4, U5): name, masked contact and dates, then by status
 * - invited: "Waiting for the tenant to accept" and "Cancel invitation";
 * - active: days left (warning colour within 30 days), "Extend" and "End tenancy";
 * - ended on its date: "Access ended on …" and "Extend" (one tap brings it back, U5).
 * Cancelling and ending are asked once more on the card itself.
 */
import { type OwnerTenancy } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { endTenancy } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { longDate } from '../portal/format.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Notice } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { useAction } from '../ui/useAction.js';
import { ExtendTenancy } from './ExtendTenancy.js';
import { daysLeftText, periodText, warnEnding } from './logic.js';

type Step = 'idle' | 'extend' | 'end';

export function TenancyCard(props: {
  tenancy: OwnerTenancy;
  today: string;
  onChanged: (note: string | null) => void;
  /** ADR 0034: on a managed unit the managing team changes the tenancy; the owner only reads. */
  readOnly?: boolean;
}): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const { t, locale } = lang;
  const action = useAction();
  const [step, setStep] = useState<Step>('idle');
  const x = props.tenancy;
  const invited = x.status === 'invited';
  const ended = x.status === 'ended';
  const warn = !invited && !ended && warnEnding(x.endsOn, props.today);

  const end = () => {
    void action.run(
      () => endTenancy(api, x.id),
      () => {
        props.onChanged(null);
      },
    );
  };

  return (
    <Card>
      <Text style={styles.name}>{x.tenantName}</Text>
      <Body muted>{x.contact}</Body>
      <Body>{periodText(x.startsOn, x.endsOn, lang)}</Body>
      {invited ? <Text style={styles.status}>{t('tenancy.waiting')}</Text> : null}
      {ended ? (
        <Text style={[styles.status, styles.warn]}>
          {t('tenancy.ended', { date: longDate(x.endsOn, locale) })}
        </Text>
      ) : null}
      {!invited && !ended && x.startsOn > props.today ? (
        <Text style={styles.status}>{t('tenancy.startsOn', { date: longDate(x.startsOn, locale) })}</Text>
      ) : null}
      {!invited && !ended && x.startsOn <= props.today ? (
        <Text style={[styles.status, warn && styles.warn]}>{daysLeftText(x.daysLeft, t)}</Text>
      ) : null}

      {props.readOnly === true ? null : (
        <View style={styles.box}>
          {step === 'extend' ? (
            <ExtendTenancy
              tenancy={x}
              today={props.today}
              onExtended={(endsOn) => {
                setStep('idle');
                props.onChanged(t('tenancy.extended', { date: longDate(endsOn, locale) }));
              }}
              onClose={() => {
                setStep('idle');
              }}
            />
          ) : null}
          {step === 'end' ? (
            <View style={styles.box} accessibilityLiveRegion="polite">
              <Body>
                {t(invited ? 'tenancy.cancelInviteConfirm' : 'tenancy.endConfirm', { name: x.tenantName })}
              </Body>
              <Button
                title={t(invited ? 'tenancy.yesCancel' : 'tenancy.yesEnd')}
                kind="danger"
                busy={action.busy}
                onPress={end}
              />
              <Button
                title={t('tenancy.keep')}
                kind="secondary"
                disabled={action.busy}
                onPress={() => {
                  setStep('idle');
                }}
              />
            </View>
          ) : null}
          {step === 'idle' && !invited ? (
            <Button
              title={t('tenancy.extend')}
              onPress={() => {
                setStep('extend');
              }}
            />
          ) : null}
          {step === 'idle' && !ended ? (
            <Button
              title={t(invited ? 'tenancy.cancelInvite' : 'tenancy.end')}
              kind="secondary"
              onPress={() => {
                setStep('end');
              }}
            />
          ) : null}
          {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.medium, fontSize: 18, color: colors.navy },
  status: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.4, color: colors.slate },
  warn: { color: colors.warn },
  box: { gap: space.sm, marginTop: space.sm },
});
