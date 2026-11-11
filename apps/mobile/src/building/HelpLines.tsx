/**
 * Building help lines on screen (E12; ADR 0029): call buttons for the building's security and building
 * management, the short "outside your home" message of the emergency screen, and the link to Building help.
 * A deliberate exception to "all contact through JAD+" (ADR 0009): these are the building's own lines.
 * Numbers are shown left-to-right in every language, and only E.164 or UAE 800 / 600 numbers are dialled (shared telHref).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { myBuildingLines } from '../api/endpoints.js';
import type { MessageKey } from '../i18n/dictionary.js';
import { useI18n, useT } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad } from '../ui/hooks.js';
import { Body, Button, Notice } from '../ui/kit.js';
import { colors, fonts, space } from '../ui/theme.js';
import { LINE_WORDS, helpCalls, linesAt, type HelpCall, type PlaceLines } from './lines.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Opens the phone's dialler; a phone that cannot call (a tablet) shows the number instead. */
export function useDial(): { dial: (call: HelpCall) => void; problem: string | null } {
  const t = useT();
  const [problem, setProblem] = useState<string | null>(null);
  const dial = useCallback(
    (call: HelpCall) => {
      setProblem(null);
      Linking.openURL(call.href).catch(() => {
        setProblem(t('buildingHelp.cannotCall', { phone: call.phone }));
      });
    },
    [t],
  );
  return { dial, problem };
}

/** One call button per line that is set; `empty` when neither is. */
export function CallButtons({ lines, empty }: { lines: PlaceLines | null; empty: MessageKey }): ReactNode {
  const t = useT();
  const { dial, problem } = useDial();
  const calls = helpCalls(lines);
  if (calls.length === 0) return <Body muted>{t(empty)}</Body>;
  return (
    <View style={styles.buttons}>
      {calls.map((call) => (
        <Button
          key={call.kind}
          kind="secondary"
          title={t(LINE_WORDS[call.kind].call)}
          onPress={() => {
            dial(call);
          }}
        />
      ))}
      {problem === null ? null : <Notice tone="error">{problem}</Notice>}
    </View>
  );
}

/**
 * E12: on the emergency screen, for water from outside the home: who is responsible and their numbers. No safety
 * instructions (L3); the report itself is still sent to JAD+ as before.
 */
export function OutsideHomeHelp({
  location,
}: {
  location: { readonly project: string | null; readonly building: string | null } | null;
}): ReactNode {
  const t = useT();
  const { api } = useSessionController();
  const load = useCallback(() => myBuildingLines(api), [api]);
  const lines = useLoad(load);
  if (lines.loading && lines.data === null) return null;
  const here = linesAt(lines.data, location);
  return (
    <View style={styles.outside}>
      <Body>{t('buildingHelp.outside')}</Body>
      {/* Until the home is chosen (several homes), there is no building to show numbers for. */}
      {location === null ? null : <CallButtons lines={here} empty="buildingHelp.none" />}
    </View>
  );
}

/** A quiet row that opens another screen: icon, title, a line under it, a chevron. */
export function LinkRow(props: {
  icon: IconName;
  title: string;
  note: string;
  onPress: () => void;
  bordered?: boolean;
}): ReactNode {
  const { info } = useI18n();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.link,
        props.bordered !== false && styles.border,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={props.icon} size={20} color={colors.slate} />
      <View style={styles.text}>
        <Text style={styles.linkTitle}>{props.title}</Text>
        <Text style={styles.note}>{props.note}</Text>
      </View>
      <Ionicons name={info.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

/** The link to Building help (My unit, the tenant's home card). */
export function BuildingHelpLink(): ReactNode {
  const router = useRouter();
  const t = useT();
  return (
    <LinkRow
      icon="shield-outline"
      title={t('buildingHelp.title')}
      note={t('buildingHelp.linkNote')}
      onPress={() => {
        router.push('/building-help');
      }}
    />
  );
}

const styles = StyleSheet.create({
  buttons: { gap: space.sm },
  outside: { gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  linkTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.slate },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
