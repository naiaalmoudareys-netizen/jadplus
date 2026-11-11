/**
 * The owner's simple consultation timeline (ADR 0031; O5, P5): contact made, the service's stages, then the end,
 * each marked done / now / next (or not reached once it ended), with the provider's short note and the day under
 * the steps already done. The states come from packages/shared consultationTimeline().
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { consultationTimeline, dubaiDate, type ConsultationView, type TimelineState } from '@jadplus/shared';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { dayLabel } from '../jobs/format.js';
import { useLang } from '../i18n/I18nProvider.js';
import { Card, Eyebrow } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { stepLabel, timelineStateLabel } from './consultationWords.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Readonly<Record<TimelineState, { name: IconName; color: string }>> = {
  done: { name: 'checkmark-circle', color: colors.ok },
  current: { name: 'ellipse', color: colors.bronze },
  next: { name: 'ellipse-outline', color: colors.muted },
  not_reached: { name: 'remove-circle-outline', color: colors.muted },
};

export function ConsultationTimeline({ v }: { v: ConsultationView }): ReactNode {
  const { t, locale } = useLang();
  return (
    <Card>
      <Eyebrow>{t('cons.timeline.title')}</Eyebrow>
      <View style={styles.list}>
        {consultationTimeline(v.serviceCode, v.status, v.steps).map((item) => {
          const icon = ICONS[item.state];
          const label = stepLabel(item.id, t);
          return (
            <View
              key={item.id}
              style={styles.item}
              accessible
              accessibilityLabel={`${label}, ${timelineStateLabel(item.state, t)}`}
            >
              <Ionicons name={icon.name} size={20} color={icon.color} />
              <View style={styles.text}>
                <Text style={[styles.label, item.state === 'current' && styles.current]}>{label}</Text>
                {item.at === null ? null : (
                  <Text style={styles.meta}>{dayLabel(dubaiDate(item.at), locale)}</Text>
                )}
                {item.note === null ? null : <Text style={styles.note}>{item.note}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm, marginTop: space.xs },
  item: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  current: { fontFamily: fonts.semibold, color: colors.navy },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
});
