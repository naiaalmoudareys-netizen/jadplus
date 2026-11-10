/**
 * Partner job queue (R3): every open job with its clock and next action due, in three groups: "Needs you now"
 * (new emergencies, anything overdue), "Upcoming", and "Waiting on the owner" (a quote sent, L4). Every job
 * opens the job page (ADR 0018). Shows no owner or tenant contact details.
 */
import type { PartnerJob } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import type { MessageKey } from '../../../src/i18n/dictionary.js';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { groupJobs, type JobGroup } from '../../../src/partner/logic.js';
import { JobRow, ListTitle, usePartnerJobs } from '../../../src/partner/JobRow.js';
import { useNow } from '../../../src/ui/hooks.js';
import { Body, Notice, Page } from '../../../src/ui/kit.js';
import { space } from '../../../src/ui/theme.js';

const GROUP_TITLES: Readonly<Record<JobGroup, MessageKey>> = {
  now: 'partner.group.now',
  upcoming: 'partner.group.upcoming',
  owner: 'partner.group.owner',
};

export default function PartnerJobs(): ReactNode {
  const t = useT();
  const now = useNow();
  const jobs = usePartnerJobs('open');
  const sections = groupJobs(jobs.data ?? [], now).map((g) => ({
    group: g.group,
    data: [...g.jobs],
  }));

  return (
    <Page scroll={false}>
      <SectionList<PartnerJob, { group: JobGroup }>
        sections={sections}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={jobs.loading} onRefresh={() => void jobs.reload()} />}
        ListHeaderComponent={jobs.error === null ? undefined : <Notice tone="error">{jobs.error}</Notice>}
        ListEmptyComponent={jobs.loading ? undefined : <Body muted>{t('access.noJobs')}</Body>}
        renderSectionHeader={({ section }) => (
          <ListTitle title={t(GROUP_TITLES[section.group])} urgent={section.group === 'now'} />
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <JobRow job={item} now={now} />
          </View>
        )}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, paddingBottom: space.xl },
  item: { marginTop: space.sm },
});
