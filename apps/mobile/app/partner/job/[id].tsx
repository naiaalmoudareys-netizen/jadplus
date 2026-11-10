/**
 * One job (R3): what it is and its clock, one clear "Next step" (acknowledge a new emergency first, E4; then
 * the journey of ADR 0018), where the unit is with "Open in Maps" and the resident's preferred time, then the
 * other steps (book the visit, quote, make safe, start, finish with photos, no access), photos and messages
 * with the resident and JAD+, which stay inside the app (ADR 0009).
 */
import type { PartnerJob } from '@jadplus/shared';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { partnerJobs, requestDetail } from '../../../src/api/endpoints.js';
import { Acknowledge } from '../../../src/jobs/Acknowledge.js';
import {
  arrivalLabel,
  dueLabel,
  isOverdue,
  jobStatusLabel,
  jobTitle,
  needsAcknowledgement,
} from '../../../src/jobs/format.js';
import { JobJourney } from '../../../src/jobs/JobJourney.js';
import { JobPlace } from '../../../src/jobs/JobPlace.js';
import { NextStep } from '../../../src/jobs/NextStep.js';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { nextStep, oneTapAction } from '../../../src/partner/logic.js';
import { useSession, useSessionController } from '../../../src/session/SessionProvider.js';
import { RequestPhotos } from '../../../src/requests/RequestPhotos.js';
import { Conversation } from '../../../src/ui/Conversation.js';
import { useLoad, useNow } from '../../../src/ui/hooks.js';
import { Body, Heading, Loading, Notice, Page, type ScrollHandle } from '../../../src/ui/kit.js';
import { cardShadow, colors, fonts, radius, space } from '../../../src/ui/theme.js';

type Section = 'acknowledge' | 'journey';

export default function Job(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const t = useT();
  // An open job, or one finished in the last 30 days (opened from the Done tab).
  const load = useCallback(async (): Promise<PartnerJob | null> => {
    const open = (await partnerJobs(api)).find((j) => j.id === id);
    return open ?? (await partnerJobs(api, 'done')).find((j) => j.id === id) ?? null;
  }, [api, id]);
  const job = useLoad(load);
  // The request with its journey and messages; refreshed every 30 seconds until push alerts exist.
  const loadDetail = useCallback(() => requestDetail(api, id), [api, id]);
  const detail = useLoad(loadDetail, 30_000);
  const scroll = useRef<ScrollHandle | null>(null);
  const offsets = useRef(new Map<Section, number>());
  const changed = () => {
    void job.reload();
    void detail.reload();
  };
  const placed = (section: Section) => (e: LayoutChangeEvent) => {
    offsets.current.set(section, e.nativeEvent.layout.y);
  };
  const goTo = (section: Section) => {
    const y = offsets.current.get(section);
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
  };

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  if (job.loading && job.data === null) return <Loading />;
  if (job.data === null) {
    return (
      <Page>
        <Notice tone="error">{job.error ?? t('access.jobGone')}</Notice>
      </Page>
    );
  }
  const j = job.data;
  const d = detail.data;
  const due = dueLabel(j, now, t);
  const arrival = arrivalLabel(j, t);
  const step = nextStep(j, d?.actions ?? [], (d?.visit ?? null) !== null);
  return (
    <Page scrollRef={scroll}>
      <Heading>{jobTitle(j, t)}</Heading>
      <Body muted>
        {j.ref} · {jobStatusLabel(j, t)}
      </Body>
      {due === null ? null : (
        <Text style={[styles.due, isOverdue(j, now) && styles.urgent]} accessibilityLiveRegion="polite">
          {due}
        </Text>
      )}
      {arrival === null ? null : <Body>{arrival}</Body>}
      {step === null ? null : (
        <NextStep
          step={step}
          jobId={j.id}
          onGo={() => {
            goTo(step === 'acknowledge' ? 'acknowledge' : 'journey');
          }}
          onDone={changed}
        />
      )}
      <JobPlace job={j} />
      <View style={styles.card}>
        <Body>{j.description}</Body>
      </View>
      {needsAcknowledgement(j) ? (
        <View onLayout={placed('acknowledge')}>
          <Acknowledge job={j} />
        </View>
      ) : null}
      {d === null ? null : <RequestPhotos requestId={j.id} photos={d.photos} />}
      {d === null ? null : (
        <View onLayout={placed('journey')}>
          <JobJourney detail={d} onChanged={changed} shownAbove={oneTapAction(step)} />
        </View>
      )}
      {d === null ? null : (
        <Conversation
          api={api}
          requestId={j.id}
          messages={d.messages}
          canMessage={d.canMessage}
          onSent={() => void detail.reload()}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    ...cardShadow,
  },
  due: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text },
  urgent: { color: colors.urgent },
});
