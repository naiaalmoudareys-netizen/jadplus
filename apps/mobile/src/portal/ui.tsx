/** Pieces shared by the owner tabs: demo label, unit switcher, status pill, progress bar, fact rows. */
import type { InstalmentKind } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buttonRadius, colors, fonts, space } from '../ui/theme.js';
import { usePortal } from './PortalProvider.js';
import { unitTitle } from './format.js';

/** Shown while the data is the demo owner, never real Salesforce data (ADR 0010). */
export function DemoBadge(): ReactNode {
  const { data } = usePortal();
  if (data?.source !== 'demo') return null;
  return (
    <View style={styles.demo} accessibilityRole="text">
      <Text style={styles.demoText}>DEMO DATA · NOT A REAL ACCOUNT</Text>
    </View>
  );
}

/** For owners with more than one unit: choose which one the tab shows. */
export function UnitSwitcher(): ReactNode {
  const { data, dealIndex, setDealIndex } = usePortal();
  const deals = data?.deals ?? [];
  if (deals.length < 2) return null;
  return (
    <View style={styles.switcher} accessibilityRole="tablist">
      {deals.map((d, i) => (
        <Pressable
          key={d.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === dealIndex }}
          onPress={() => {
            setDealIndex(i);
          }}
          style={[styles.chip, i === dealIndex && styles.chipOn]}
        >
          <Text style={[styles.chipText, i === dealIndex && styles.chipTextOn]}>{unitTitle(d)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const PILL_TONE: Readonly<Record<InstalmentKind, { bg: string; fg: string }>> = {
  paid: { bg: colors.okSoft, fg: colors.ok },
  overdue: { bg: colors.urgentSoft, fg: colors.urgent },
  soon: { bg: colors.warnSoft, fg: colors.warn },
  part: { bg: colors.mist, fg: colors.slate },
  upcoming: { bg: colors.backgroundAlt, fg: colors.textSecondary },
  later: { bg: colors.backgroundAlt, fg: colors.textSecondary },
};

export function Pill({ kind, label }: { kind: InstalmentKind; label: string }): ReactNode {
  const tone = PILL_TONE[kind];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

/** 0-100, with the number spoken for screen readers. */
export function ProgressBar({ percent }: { percent: number }): ReactNode {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View style={[styles.fill, { width: `${String(value)}%` }]} />
    </View>
  );
}

/** A label and its value on one line ("BEDROOMS   2"). Hidden when there is no value. */
export function Fact({ label, value }: { label: string; value: string | number | null }): ReactNode {
  if (value === null || value === '') return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  demo: {
    backgroundColor: colors.warnSoft,
    borderRadius: buttonRadius,
    paddingVertical: 6,
    alignItems: 'center',
  },
  demoText: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.6, color: colors.warn },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.slate,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.slate },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.slate },
  chipTextOn: { color: colors.onNavy },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.backgroundAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.slate },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: space.md,
  },
  factLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  factValue: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
});
