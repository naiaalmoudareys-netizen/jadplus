/**
 * Partner job queue (R3): open jobs, emergencies first, each with its clock and next action due; every job,
 * emergency or routine, opens the job page (ADR 0018). Refreshes every 30 seconds until push alerts are
 * connected. Shows no owner or tenant contact details.
 */
import { Link, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { PartnerJob } from '@jadplus/shared';
import { partnerJobs } from '../../src/api/endpoints.js';
import { arrivalLabel, dueLabel, isOverdue, jobStatusLabel, jobTitle } from '../../src/jobs/format.js';
import { useT } from '../../src/i18n/I18nProvider.js';
import { useSession, useSessionController } from '../../src/session/SessionProvider.js';
import { useLoad, useNow } from '../../src/ui/hooks.js';
import { Body, Notice, Page } from '../../src/ui/kit.js';
import { colors, fonts, radius, space } from '../../src/ui/theme.js';

const REFRESH_MS = 30_000;

function JobRow({ job, now, onPress }: { job: PartnerJob; now: number; onPress: () => void }): ReactNode {
  const t = useT();
  const due = dueLabel(job, now, t);
  const late = isOverdue(job, now);
  const arrival = arrivalLabel(job, t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${jobTitle(job, t)}, ${job.ref}, ${jobStatusLabel(job, t)}${due === null ? '' : `, ${due}`}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, job.emergency && styles.emergency, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.title, job.emergency && styles.urgentText]}>{jobTitle(job, t)}</Text>
        <Text style={styles.ref}>{job.ref}</Text>
      </View>
      <Text style={styles.status}>{jobStatusLabel(job, t)}</Text>
      {due === null ? null : <Text style={[styles.due, late && styles.urgentText]}>{due}</Text>}
      {arrival === null ? null : <Text style={styles.status}>{arrival}</Text>}
    </Pressable>
  );
}

export default function PartnerJobs(): ReactNode {
  const session = useSession();
  const t = useT();
  const { api } = useSessionController();
  const router = useRouter();
  const now = useNow();
  const load = useCallback(() => partnerJobs(api), [api]);
  const jobs = useLoad(load, REFRESH_MS);
  const { reload } = jobs;
  // Reload whenever the screen comes back into view (e.g. after acknowledging a job).
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (session.status !== 'signed_in') return <Redirect href="/" />;
  return (
    <Page scroll={false}>
      <FlatList
        data={jobs.data ?? []}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={jobs.loading} onRefresh={() => void jobs.reload()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {jobs.error === null ? null : <Notice tone="error">{jobs.error}</Notice>}
            <Link href="/settings" style={styles.link}>
              {t('title.account')}
            </Link>
          </View>
        }
        ListEmptyComponent={jobs.loading ? undefined : <Body muted>{t('access.noJobs')}</Body>}
        renderItem={({ item }) => (
          <JobRow
            job={item}
            now={now}
            onPress={() => {
              router.push({ pathname: '/partner/job/[id]', params: { id: item.id } });
            }}
          />
        )}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.sm, alignItems: 'flex-end' },
  link: { fontSize: 17, fontFamily: fonts.regular, color: colors.slate, textDecorationLine: 'underline' },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emergency: { borderColor: colors.urgent, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 19, fontFamily: fonts.semibold, color: colors.text },
  ref: { fontSize: 15, fontFamily: fonts.regular, color: colors.muted },
  status: { fontSize: 16, fontFamily: fonts.regular, color: colors.muted },
  due: { fontSize: 17, fontFamily: fonts.semibold, color: colors.text },
  urgentText: { color: colors.urgent },
});
