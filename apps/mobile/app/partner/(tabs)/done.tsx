/** Done (R3, S8): the jobs this partner finished in the last 30 days, newest first (the API's order). */
import type { ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { JobRow, usePartnerJobs } from '../../../src/partner/JobRow.js';
import { useNow } from '../../../src/ui/hooks.js';
import { Body, Notice, Page } from '../../../src/ui/kit.js';
import { space } from '../../../src/ui/theme.js';

export default function Done(): ReactNode {
  const t = useT();
  const now = useNow();
  const jobs = usePartnerJobs('done');

  return (
    <Page scroll={false}>
      <FlatList
        data={jobs.data ?? []}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={jobs.loading} onRefresh={() => void jobs.reload()} />}
        ListHeaderComponent={
          <>
            <Body muted>{t('partner.done.note')}</Body>
            {jobs.error === null ? null : <Notice tone="error">{jobs.error}</Notice>}
          </>
        }
        ListEmptyComponent={jobs.loading ? undefined : <Body muted>{t('partner.done.empty')}</Body>}
        renderItem={({ item }) => <JobRow job={item} now={now} showClock={false} />}
      />
    </Page>
  );
}

const styles = StyleSheet.create({ list: { padding: space.md, paddingBottom: space.xl, gap: space.sm } });
