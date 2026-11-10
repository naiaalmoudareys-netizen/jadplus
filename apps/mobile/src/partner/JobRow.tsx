/**
 * One job in a technician's list (R3): what, where, its status, the clock and the arrival window. Emergencies
 * waiting for acknowledgement and overdue clocks are red. No owner or tenant contact details (ADR 0009).
 */
import type { PartnerJob } from '@jadplus/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { partnerJobs } from '../api/endpoints.js';
import { arrivalLabel, dueLabel, isOverdue, jobStatusLabel, jobTitle, placeLabel } from '../jobs/format.js';
import { useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad, type Loaded } from '../ui/hooks.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';

/** Lists refresh every 30 seconds until push alerts are connected, and whenever the tab comes back into view. */
const REFRESH_MS = 30_000;

export function usePartnerJobs(view: 'open' | 'done'): Loaded<PartnerJob[]> {
  const { api } = useSessionController();
  const load = useCallback(() => partnerJobs(api, view), [api, view]);
  const jobs = useLoad(load, REFRESH_MS);
  const { reload } = jobs;
  // Back from a job (e.g. after acknowledging it): show where it stands now.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return jobs;
}

export function JobRow({
  job,
  now,
  showClock = true,
}: {
  job: PartnerJob;
  now: number;
  /** Finished jobs have no clock to show. */
  showClock?: boolean;
}): ReactNode {
  const t = useT();
  const router = useRouter();
  const due = showClock ? dueLabel(job, now, t) : null;
  const late = showClock && isOverdue(job, now);
  const arrival = arrivalLabel(job, t);
  const urgent = showClock && job.emergency;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${jobTitle(job, t)}, ${job.ref}, ${jobStatusLabel(job, t)}${due === null ? '' : `, ${due}`}`}
      onPress={() => {
        router.push({ pathname: '/partner/job/[id]', params: { id: job.id } });
      }}
      style={({ pressed }) => [styles.row, urgent && styles.emergency, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <Text style={[styles.title, urgent && styles.urgentText]}>{jobTitle(job, t)}</Text>
        <Text style={styles.ref}>{job.ref}</Text>
      </View>
      <Text style={styles.place}>{placeLabel(job.location, t)}</Text>
      <Text style={styles.status}>{jobStatusLabel(job, t)}</Text>
      {due === null ? null : <Text style={[styles.due, late && styles.urgentText]}>{due}</Text>}
      {arrival === null ? null : <Text style={styles.status}>{arrival}</Text>}
    </Pressable>
  );
}

/** A small capital heading above a group of jobs ("NEEDS YOU NOW"). */
export function ListTitle({ title, urgent = false }: { title: string; urgent?: boolean }): ReactNode {
  return (
    <Text style={[styles.listTitle, urgent && styles.urgentText]} accessibilityRole="header">
      {title.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  emergency: { borderColor: colors.urgent, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontSize: 19, fontFamily: fonts.semibold, color: colors.text },
  ref: { fontSize: 15, fontFamily: fonts.regular, color: colors.muted },
  place: { fontSize: 15, fontFamily: fonts.regular, color: colors.textSecondary },
  status: { fontSize: 16, fontFamily: fonts.regular, color: colors.muted },
  due: { fontSize: 17, fontFamily: fonts.semibold, color: colors.text },
  urgentText: { color: colors.urgent },
  listTitle: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.muted,
    marginTop: space.md,
  },
});
