/**
 * One job (R3): where and what, its clock, and the next step. A new emergency is acknowledged first (E4);
 * then the journey (ADR 0018): book the visit, quote chargeable work, start, mark done with photos. Messages
 * with the resident and JAD+ stay inside the app (ADR 0009).
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { partnerJobs, requestDetail } from '../../../src/api/endpoints.js';
import { Acknowledge } from '../../../src/jobs/Acknowledge.js';
import {
  arrivalLabel,
  dueLabel,
  isOverdue,
  jobStatusLabel,
  jobTitle,
  needsAcknowledgement,
  placeLabel,
  preferredVisitLabel,
} from '../../../src/jobs/format.js';
import { JobJourney } from '../../../src/jobs/JobJourney.js';
import { useLang } from '../../../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../../../src/session/SessionProvider.js';
import { RequestPhotos } from '../../../src/requests/RequestPhotos.js';
import { Conversation } from '../../../src/ui/Conversation.js';
import { useLoad, useNow } from '../../../src/ui/hooks.js';
import { Body, Heading, Loading, Notice, Page } from '../../../src/ui/kit.js';
import { colors, fonts, radius, space } from '../../../src/ui/theme.js';

export default function Job(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const lang = useLang();
  const { t } = lang;
  const load = useCallback(async () => (await partnerJobs(api)).find((j) => j.id === id) ?? null, [api, id]);
  const job = useLoad(load);
  // The request with its journey and messages; refreshed every 30 seconds until push alerts exist.
  const loadDetail = useCallback(() => requestDetail(api, id), [api, id]);
  const detail = useLoad(loadDetail, 30_000);
  const changed = () => {
    void job.reload();
    void detail.reload();
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
  const due = dueLabel(j, now, t);
  const arrival = arrivalLabel(j, t);
  const preferred = preferredVisitLabel(j, lang);
  return (
    <Page>
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
      {preferred === null ? null : <Body muted>{preferred}</Body>}
      <View style={styles.card}>
        <Body>{placeLabel(j.location, t)}</Body>
        {j.location?.address ? <Body muted>{j.location.address}</Body> : null}
      </View>
      <View style={styles.card}>
        <Body>{j.description}</Body>
      </View>
      {needsAcknowledgement(j) ? <Acknowledge job={j} /> : null}
      {detail.data === null ? null : <RequestPhotos requestId={j.id} photos={detail.data.photos} />}
      {detail.data === null ? null : <JobJourney detail={detail.data} onChanged={changed} />}
      {detail.data === null ? null : (
        <Conversation
          api={api}
          requestId={j.id}
          messages={detail.data.messages}
          canMessage={detail.data.canMessage}
          onSent={() => void detail.reload()}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: space.xs },
  due: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text },
  urgent: { color: colors.urgent },
});
