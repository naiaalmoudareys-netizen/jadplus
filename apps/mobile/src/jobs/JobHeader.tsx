/**
 * The top of a technician's job (R3): what it is (emergencies in red), its reference, the clock as a small pill
 * (time left or overdue) and the progress tracker New → Booked (emergencies: Acknowledged, E4) → On the way →
 * Working → Done (→ Confirmed). A quote waiting for the owner pauses the current step (L4).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PartnerJob } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MessageKey } from '../i18n/dictionary.js';
import { useT } from '../i18n/I18nProvider.js';
import type { JobProgress, TrackStep } from '../partner/progress.js';
import { colors, fonts, space } from '../ui/theme.js';
import { dueLabel, isOverdue, jobTitle, statusLabel } from './format.js';

const STEP_KEYS: Readonly<Record<TrackStep, MessageKey>> = {
  new: 'job.track.new',
  booked: 'job.track.booked',
  acknowledged: 'job.track.acknowledged',
  on_the_way: 'job.track.on_the_way',
  working: 'job.track.working',
  done: 'job.track.done',
  confirmed: 'job.track.confirmed',
};

function Tracker({ progress }: { progress: JobProgress }): ReactNode {
  const t = useT();
  const { steps, reached, state } = progress;
  const last = steps.length - 1;
  const paused = state === 'owner' || state === 'hold';
  const current = steps[reached];
  const pausedText =
    state === 'owner'
      ? t('job.track.owner')
      : state === 'hold'
        ? statusLabel('on_hold', t)
        : state === 'cancelled'
          ? statusLabel('cancelled', t)
          : null;
  const name = current === undefined ? '' : t(STEP_KEYS[current]);
  return (
    <View style={styles.trackBox}>
      <View
        style={styles.track}
        accessible
        accessibilityLabel={t('job.track.label', {
          step: reached + 1,
          total: steps.length,
          name: pausedText === null ? name : `${name}, ${pausedText}`,
        })}
      >
        {steps.map((step, i) => (
          <View key={step} style={styles.stop}>
            <View style={styles.dotRow}>
              <View style={[styles.line, i === 0 && styles.hidden, i <= reached && styles.lineOn]} />
              <View
                style={[
                  styles.dot,
                  i <= reached && styles.dotOn,
                  i === reached && styles.dotCurrent,
                  i === reached && paused && styles.dotPaused,
                  state === 'complete' && styles.dotComplete,
                ]}
              />
              <View style={[styles.line, i === last && styles.hidden, i < reached && styles.lineOn]} />
            </View>
            <Text style={[styles.stepText, i === reached && styles.stepCurrent]} numberOfLines={2}>
              {t(STEP_KEYS[step])}
            </Text>
          </View>
        ))}
      </View>
      {pausedText === null ? null : (
        <View style={styles.pausedRow}>
          <Ionicons
            name={state === 'cancelled' ? 'close-circle-outline' : 'pause-circle-outline'}
            size={18}
            color={state === 'cancelled' ? colors.muted : colors.warn}
          />
          <Text style={[styles.pausedText, state === 'cancelled' && styles.cancelledText]}>{pausedText}</Text>
        </View>
      )}
    </View>
  );
}

export function JobHeader(props: { job: PartnerJob; progress: JobProgress; now: number }): ReactNode {
  const t = useT();
  const { job, now } = props;
  const due = dueLabel(job, now, t);
  const late = isOverdue(job, now) || job.nextDueKind === 'emergency_ack';
  return (
    <View style={styles.box}>
      <Text style={[styles.title, job.emergency && styles.urgent]} accessibilityRole="header">
        {jobTitle(job, t)}
      </Text>
      <View style={styles.refRow}>
        <Text style={styles.ref}>{job.ref}</Text>
        {due === null ? null : (
          <View style={[styles.pill, late && styles.pillLate]}>
            <Ionicons name="time-outline" size={14} color={late ? colors.urgent : colors.slate} />
            <Text style={[styles.pillText, late && styles.urgent]} accessibilityLiveRegion="polite">
              {due}
            </Text>
          </View>
        )}
      </View>
      <Tracker progress={props.progress} />
    </View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  box: { gap: space.sm },
  title: { fontFamily: fonts.light, fontSize: 28, letterSpacing: -0.5, color: colors.navy },
  urgent: { color: colors.urgent },
  refRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  ref: { fontFamily: fonts.medium, fontSize: 15, color: colors.textSecondary },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.mist,
  },
  pillLate: { backgroundColor: colors.urgentSoft },
  pillText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.slate },
  trackBox: { gap: space.sm, marginTop: space.sm },
  track: { flexDirection: 'row' },
  stop: { flex: 1, alignItems: 'center', gap: space.xs },
  dotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: colors.line },
  lineOn: { backgroundColor: colors.slate },
  hidden: { backgroundColor: 'transparent' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  dotOn: { borderColor: colors.slate, backgroundColor: colors.slate },
  dotCurrent: { transform: [{ scale: 1.3 }] },
  dotPaused: { borderColor: colors.warn, backgroundColor: colors.warnSoft },
  dotComplete: { borderColor: colors.ok, backgroundColor: colors.ok },
  stepText: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textAlign: 'center' },
  stepCurrent: { fontFamily: fonts.semibold, color: colors.navy },
  pausedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pausedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.warn },
  cancelledText: { color: colors.muted },
});
