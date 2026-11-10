/**
 * Today (R3): new emergencies waiting to be acknowledged first, in red (E4), then the visits whose arrival
 * window starts today (Dubai date), earliest first. The partner's start page (/partner).
 */
import { dubaiDate } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { dayLabel } from '../../../src/jobs/format.js';
import { useLang } from '../../../src/i18n/I18nProvider.js';
import { todayJobs } from '../../../src/partner/logic.js';
import { JobRow, ListTitle, usePartnerJobs } from '../../../src/partner/JobRow.js';
import { useNow } from '../../../src/ui/hooks.js';
import { Body, Eyebrow, Notice, Page } from '../../../src/ui/kit.js';
import { space } from '../../../src/ui/theme.js';

export default function Today(): ReactNode {
  const { t, locale } = useLang();
  const now = useNow();
  const jobs = usePartnerJobs('open');
  const { urgent, visits } = todayJobs(jobs.data ?? [], now);
  const empty = !jobs.loading && urgent.length === 0 && visits.length === 0;

  return (
    <Page scroll={false}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={jobs.loading} onRefresh={() => void jobs.reload()} />}
      >
        <Eyebrow>{dayLabel(dubaiDate(now), locale)}</Eyebrow>
        {jobs.error === null ? null : <Notice tone="error">{jobs.error}</Notice>}
        {urgent.length === 0 ? null : <ListTitle title={t('partner.today.urgent')} urgent />}
        {urgent.map((job) => (
          <JobRow key={job.id} job={job} now={now} />
        ))}
        {visits.length === 0 ? null : <ListTitle title={t('partner.today.visits')} />}
        {visits.map((job) => (
          <JobRow key={job.id} job={job} now={now} />
        ))}
        {empty ? (
          <View style={styles.empty}>
            <Body muted>{t('partner.today.empty')}</Body>
          </View>
        ) : null}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, paddingBottom: space.xl, gap: space.sm },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
});
