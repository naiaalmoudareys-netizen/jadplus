/**
 * A consultation on the owner's request page (ADR 0031; O5, P5), in place of the visit journey: the stage timeline,
 * what the owner told the provider and the consent they gave, how it ended (Done, or Did not proceed with the
 * provider's reason), closing it once the provider has finished, the rating after a consultation that was done, and
 * "No longer needed" at any time before the provider finishes. Every button comes from `actions` (the API's rules).
 */
import { questionsFor, type ConsultationView, type RequestDetail } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { closeRequest, confirmWork } from '../api/endpoints.js';
import { useLang } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Body, Button, Card, Eyebrow, Notice } from '../ui/kit.js';
import { useAction } from '../ui/useAction.js';
import { dayLabel } from '../jobs/format.js';
import { space } from '../ui/theme.js';
import { ConsultationTimeline } from './ConsultationTimeline.js';
import { optionLabel, questionLabel } from './consultationWords.js';
import { GivenRating, RateRequest } from './Rating.js';

function Answers({ v }: { v: ConsultationView }): ReactNode {
  const { t, locale } = useLang();
  return (
    <Card>
      <Eyebrow>{t('cons.answers.title')}</Eyebrow>
      {questionsFor(v.serviceCode).map((q) => {
        const value = v.answers[q.id] ?? '';
        const answer =
          q.kind === 'date'
            ? dayLabel(value, locale)
            : optionLabel(value, q.options.find((o) => o.id === value)?.label ?? value, t);
        return (
          <Body key={q.id}>
            {questionLabel(q, t)} {answer}
          </Body>
        );
      })}
      <Body muted>{t('cons.consentGiven', { provider: v.consent.providerName })}</Body>
    </Card>
  );
}

function Outcome({ v }: { v: ConsultationView }): ReactNode {
  const { t } = useLang();
  const end = v.steps.find((s) => s.step === 'done' || s.step === 'did_not_proceed');
  if (end === undefined) return null;
  return (
    <Card>
      <Body>
        {end.step === 'done'
          ? t('cons.outcome.done', { provider: v.consent.providerName })
          : t('cons.outcome.didNotProceed')}
      </Body>
      {end.note === null ? null : <Body muted>{end.note}</Body>}
    </Card>
  );
}

function NoLongerNeeded(props: { requestId: string; provider: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const { t } = useLang();
  const action = useAction();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        title={t('cons.cancel.open')}
        kind="secondary"
        onPress={() => {
          setAsking(true);
        }}
      />
    );
  }
  return (
    <Card>
      <View style={styles.box} accessibilityLiveRegion="polite">
        <Body>{t('cons.cancel.confirm', { provider: props.provider })}</Body>
        <Button
          title={t('cons.cancel.yes')}
          kind="danger"
          busy={action.busy}
          onPress={() =>
            void action.run(() => closeRequest(api, props.requestId, { reason: 'cancel' }), props.onDone)
          }
        />
        <Button
          title={t('extras.keep')}
          kind="secondary"
          disabled={action.busy}
          onPress={() => {
            setAsking(false);
          }}
        />
        {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
      </View>
    </Card>
  );
}

function CloseIt(props: { requestId: string; onDone: () => void }): ReactNode {
  const { api } = useSessionController();
  const { t } = useLang();
  const action = useAction();
  return (
    <Card>
      <Button
        title={t('cons.closeIt')}
        busy={action.busy}
        onPress={() => void action.run(() => confirmWork(api, props.requestId, true), props.onDone)}
      />
      <Body muted>{t('cons.closeIt.note')}</Body>
      {action.error === null ? null : <Notice tone="error">{action.error}</Notice>}
    </Card>
  );
}

export function ConsultationJourney(props: {
  detail: RequestDetail;
  consultation: ConsultationView;
  onChanged: () => void;
}): ReactNode {
  const { request, actions, rating } = props.detail;
  const v = props.consultation;
  return (
    <View style={styles.box}>
      <ConsultationTimeline v={v} />
      <Outcome v={v} />
      {actions.includes('confirm_done') ? <CloseIt requestId={request.id} onDone={props.onChanged} /> : null}
      {actions.includes('rate') ? <RateRequest requestId={request.id} onDone={props.onChanged} /> : null}
      {rating === null ? null : <GivenRating rating={rating} />}
      <Answers v={v} />
      {actions.includes('cancel') ? (
        <NoLongerNeeded requestId={request.id} provider={v.consent.providerName} onDone={props.onChanged} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.md } });
