/**
 * The resident's decisions in the request journey (ADR 0018):
 * - the owner approves or declines a quote (L4: JAD+ never approves chargeable work for them); declining
 *   asks once more, on the screen itself;
 * - after the work, "Is the work done?" (E10); "Not done yet" reopens it with the same partner (A5), and
 *   with no answer it closes by itself after 72 hours (A4).
 */
import { AUTO_CLOSE_HOURS, type RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { confirmWork, decideQuote } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { space } from '../ui/theme.js';

export function QuoteDecision(props: {
  requestId: string;
  quote: NonNullable<RequestDetail['quote']>;
  onDone: () => void;
}): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const [confirming, setConfirming] = useState(false);
  const decide = (decision: 'approve' | 'decline') => {
    void action.run(
      () => decideQuote(api, props.requestId, { quoteId: props.quote.id, decision }),
      props.onDone,
    );
  };
  return (
    <View style={styles.box}>
      <Body muted>{t('journey.quote.ownerNote')}</Body>
      {confirming ? (
        <View style={styles.box} accessibilityLiveRegion="polite">
          <Body>{t('journey.quote.confirmDecline')}</Body>
          <Button
            title={t('journey.quote.yesDecline')}
            kind="danger"
            busy={action.busy}
            onPress={() => {
              decide('decline');
            }}
          />
          <Button
            title={t('journey.quote.keep')}
            kind="secondary"
            disabled={action.busy}
            onPress={() => {
              setConfirming(false);
            }}
          />
        </View>
      ) : (
        <>
          <Button
            title={t('journey.quote.approve')}
            busy={action.busy}
            onPress={() => {
              decide('approve');
            }}
          />
          <Button
            title={t('journey.quote.decline')}
            kind="secondary"
            disabled={action.busy}
            onPress={() => {
              setConfirming(true);
            }}
          />
        </>
      )}
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </View>
  );
}

export function ConfirmWork(props: { requestId: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const t = useT();
  const action = useAction();
  const answer = (done: boolean) => {
    void action.run(() => confirmWork(api, props.requestId, done), props.onDone);
  };
  return (
    <Card>
      <Eyebrow>{t('journey.done.title')}</Eyebrow>
      <Body muted>{t('journey.done.autoClose', { hours: AUTO_CLOSE_HOURS })}</Body>
      <View style={styles.box}>
        <Button
          title={t('journey.done.yes')}
          disabled={action.busy}
          onPress={() => {
            answer(true);
          }}
        />
        <Button
          title={t('journey.done.no')}
          kind="secondary"
          disabled={action.busy}
          onPress={() => {
            answer(false);
          }}
        />
      </View>
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm, marginTop: space.xs } });
