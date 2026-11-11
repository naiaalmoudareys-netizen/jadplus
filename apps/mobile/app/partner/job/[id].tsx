/**
 * One job for the technician (R3; Naya, 10-Nov-2026 "make the job page simpler"): what it is with its clock and
 * a progress tracker; when and where (with "Open in Maps"); then folded sections for the problem, the messages
 * with the resident and JAD+ (ADR 0009: all contact inside the app), the quote and make-safe work and the
 * finished-work photos; and a bar at the bottom with one big button for the next step (acknowledge a new
 * emergency first, E4; then the journey of ADR 0018) and "More" for the other steps.
 */
import type { PartnerJob } from '@jadplus/shared';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { partnerJobs, requestDetail } from '../../../src/api/endpoints.js';
import { DeliverySection } from '../../../src/jobs/DeliverySection.js';
import { JobBar } from '../../../src/jobs/JobBar.js';
import { hasProjectSide } from '../../../src/managed/logic.js';
import { JobForms } from '../../../src/jobs/JobForms.js';
import { JobHeader } from '../../../src/jobs/JobHeader.js';
import { JobSections } from '../../../src/jobs/JobSections.js';
import { JobVisit } from '../../../src/jobs/JobVisit.js';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { nextStep } from '../../../src/partner/logic.js';
import { jobProgress, moreActions, type JobForm, type JobStep } from '../../../src/partner/progress.js';
import { useSession, useSessionController } from '../../../src/session/SessionProvider.js';
import { useLoad, useNow } from '../../../src/ui/hooks.js';
import { Loading, Notice, Page } from '../../../src/ui/kit.js';
import { space } from '../../../src/ui/theme.js';

/** How long "Visit booked." and the other confirmations stay in the bottom bar. */
const CONFIRMATION_MS = 5_000;

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
  const [form, setForm] = useState<JobForm | null>(null);
  const [confirmed, setConfirmed] = useState<JobStep | null>(null);

  useEffect(() => {
    if (confirmed === null) return undefined;
    const timer = setTimeout(() => {
      setConfirmed(null);
    }, CONFIRMATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [confirmed]);

  const done = (step: JobStep) => {
    setForm(null);
    setConfirmed(step);
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
  const d = detail.data;
  const actions = d?.actions ?? [];
  const primary = nextStep(j, actions, (d?.visit ?? null) !== null);
  return (
    <Page scroll={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <JobHeader job={j} progress={jobProgress(j, d)} now={now} />
        <JobVisit job={j} visit={d?.visit ?? null} now={now} />
        {/* ADR 0034: the furnishing delivery date, once the owner approved the quote. */}
        {hasProjectSide(j.serviceName) ? <DeliverySection jobId={j.id} /> : null}
        <JobSections
          job={j}
          detail={d}
          onMessageSent={() => {
            void detail.reload();
          }}
        />
        {detail.error === null ? null : <Notice tone="error">{detail.error}</Notice>}
      </ScrollView>
      <JobBar
        jobId={j.id}
        detail={d}
        primary={primary}
        more={moreActions(actions, primary)}
        confirmed={confirmed}
        onForm={setForm}
        onDone={done}
      />
      {form === null ? null : (
        <JobForms
          form={form}
          job={j}
          detail={d}
          onClose={() => {
            setForm(null);
          }}
          onSwitch={setForm}
          onDone={done}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
