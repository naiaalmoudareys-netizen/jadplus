/**
 * "My numbers" (S5, S8) on the technician's Profile: jobs done, on time, average rating and repeat visits over
 * the last 7, 30 or 90 days. The partner office sees the whole company's numbers.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { partnerStats } from '../api/endpoints.js';
import { useT } from '../i18n/I18nProvider.js';
import { Group, SettingsRow } from '../profile/ProfileParts.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Choice } from '../ui/Choice.js';
import { useLoad } from '../ui/hooks.js';
import { Notice } from '../ui/kit.js';
import { space } from '../ui/theme.js';
import { STATS_PERIODS, onTimePercent, ratingText, type StatsPeriod } from './logic.js';

const NONE = '-';

export function MyNumbers(): ReactNode {
  const t = useT();
  const { api } = useSessionController();
  const [days, setDays] = useState<StatsPeriod>(30);
  const load = useCallback(() => partnerStats(api, days), [api, days]);
  const stats = useLoad(load);
  const s = stats.data;
  const percent = s === null ? null : onTimePercent(s.onTime);
  const rating = s === null ? null : ratingText(s.rating);

  return (
    <>
      <Group title={s?.scope === 'company' ? t('partner.numbers.company') : t('partner.numbers')}>
        <View style={styles.periods} accessibilityRole="radiogroup">
          {STATS_PERIODS.map((d) => (
            <View key={d} style={styles.period}>
              <Choice
                compact
                title={t('partner.numbers.days', { days: d })}
                selected={d === days}
                onPress={() => {
                  setDays(d);
                }}
              />
            </View>
          ))}
        </View>
        <SettingsRow
          icon="checkmark-done-outline"
          title={t('partner.numbers.jobsDone')}
          value={s === null ? NONE : String(s.jobsDone)}
        />
        <SettingsRow
          icon="time-outline"
          title={t('partner.numbers.onTime')}
          detail={
            s === null || s.onTime.total === 0
              ? null
              : t('partner.numbers.onTimeOf', { met: s.onTime.met, total: s.onTime.total })
          }
          value={percent === null ? NONE : t('partner.numbers.percent', { value: percent })}
        />
        <SettingsRow
          icon="star-outline"
          title={t('partner.numbers.rating')}
          detail={
            s === null || rating === null ? null : t('partner.numbers.ratingCount', { count: s.rating.count })
          }
          value={rating ?? NONE}
        />
        <SettingsRow
          icon="repeat-outline"
          title={t('partner.numbers.repeat')}
          detail={t('partner.numbers.repeatNote')}
          value={s === null ? NONE : String(s.repeatVisits)}
        />
      </Group>
      {stats.error === null ? null : <Notice tone="error">{stats.error}</Notice>}
    </>
  );
}

const styles = StyleSheet.create({
  periods: { flexDirection: 'row', gap: space.sm, paddingVertical: space.md },
  period: { flex: 1 },
});
