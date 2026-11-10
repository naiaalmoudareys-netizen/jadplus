/** Pieces shared by the owner tabs: demo label, unit switcher, status pill, progress bar, fact rows. */
import type { InstalmentKind } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Notice } from '../ui/kit.js';
import { buttonRadius, colors, fonts, space } from '../ui/theme.js';
import { usePortal } from './PortalProvider.js';
import { unitTitle } from './format.js';
import { useT } from '../i18n/I18nProvider.js';

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
  const t = useT();
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
          <Text style={[styles.chipText, i === dealIndex && styles.chipTextOn]}>{unitTitle(d, t)}</Text>
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

/**
 * One line of money: what it is (and what for) on the left, the amount (and date) on the right, so receipts
 * and fees read as a tidy list rather than a block of text.
 */
export function LineItem(props: {
  title: string;
  detail?: string | null;
  amount: string;
  note?: string | null;
  tone?: 'normal' | 'good' | 'bad';
  /** When set, the row opens something (a receipt, a document) and says "Open" (or `action`). */
  onPress?: () => void;
  action?: string;
}): ReactNode {
  const tone = props.tone ?? 'normal';
  const row = (
    <View
      style={styles.line}
      accessible
      accessibilityLabel={[props.title, props.detail, props.amount, props.note].filter(Boolean).join(', ')}
    >
      <View style={styles.lineLeft}>
        <Text style={styles.lineTitle}>{props.title}</Text>
        {props.detail ? <Text style={styles.lineDetail}>{props.detail}</Text> : null}
      </View>
      <View style={styles.lineRight}>
        <Text style={[styles.lineAmount, tone === 'bad' && styles.bad]}>{props.amount}</Text>
        {props.note ? (
          <Text style={[styles.lineDetail, tone === 'good' && styles.good]}>{props.note}</Text>
        ) : null}
        {props.onPress === undefined ? null : (
          <Text style={styles.open}>{(props.action ?? 'Open').toUpperCase()}</Text>
        )}
      </View>
    </View>
  );
  if (props.onPress === undefined) return row;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {row}
    </Pressable>
  );
}

/** Shown on an owner tab when the data could not be loaded, with a way to try again. */
export function PortalError(): ReactNode {
  const { error, loading, reload } = usePortal();
  return (
    <View style={styles.errorBox}>
      <Notice tone="error">{error ?? 'We could not load your details right now.'}</Notice>
      <Button title="Try again" busy={loading} onPress={() => void reload()} />
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
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  lineLeft: { flex: 1, gap: 2 },
  lineRight: { alignItems: 'flex-end', gap: 2 },
  lineTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  lineDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  lineAmount: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  good: { color: colors.ok },
  bad: { color: colors.urgent },
  errorBox: { gap: space.md },
  open: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.slate },
  pressed: { opacity: 0.6 },
  factLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  factValue: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
});
