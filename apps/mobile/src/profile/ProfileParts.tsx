/** Building blocks of the Profile (ADR 0016): grouped settings rows, switches and the person's header. */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nProvider.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A titled group of rows on one card. */
export function Group({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** One row: icon, title (and a line under it), a value on the far side, and a chevron when it opens something. */
export function SettingsRow(props: {
  icon: IconName;
  title: string;
  detail?: string | null;
  value?: string | null;
  danger?: boolean;
  busy?: boolean;
  onPress?: () => void;
}): ReactNode {
  const danger = props.danger === true;
  const { rtl } = useI18n().info;
  const content = (
    <>
      <Ionicons name={props.icon} size={22} color={danger ? colors.urgent : colors.slate} />
      <View style={styles.text}>
        <Text style={[styles.title, danger && styles.danger]}>{props.title}</Text>
        {props.detail === undefined || props.detail === null ? null : (
          <Text style={styles.detail}>{props.detail}</Text>
        )}
      </View>
      {props.value === undefined || props.value === null ? null : (
        <Text style={styles.value} numberOfLines={1}>
          {props.value}
        </Text>
      )}
      {props.onPress === undefined ? null : (
        <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
      )}
    </>
  );
  if (props.onPress === undefined) {
    return (
      <View style={styles.row} accessible>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: props.busy === true }}
      disabled={props.busy === true}
      onPress={props.onPress}
      style={({ pressed }) => [styles.row, (pressed || props.busy === true) && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** A row with an on/off switch. */
export function SwitchRow(props: {
  icon: IconName;
  title: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}): ReactNode {
  const off = props.disabled === true;
  return (
    <View style={[styles.row, off && styles.pressed]}>
      <Ionicons name={props.icon} size={22} color={colors.slate} />
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.detail === undefined ? null : <Text style={styles.detail}>{props.detail}</Text>}
      </View>
      <Switch
        accessibilityLabel={props.title}
        value={props.value}
        disabled={off}
        onValueChange={props.onChange}
        trackColor={{ true: colors.slate, false: colors.line }}
      />
    </View>
  );
}

/** Initials in a navy circle, the name, and the role line. */
export function ProfileHeader(props: { name: string; line: string }): ReactNode {
  const initials = props.name
    .split(/\s+/)
    .filter((w) => w !== '')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <View style={styles.header}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials === '' ? '·' : initials}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>{props.name}</Text>
        <Text style={styles.detail}>{props.line}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  groupTitle: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.muted,
    marginTop: space.sm,
  },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: space.md, ...cardShadow },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.55 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  danger: { color: colors.urgent },
  detail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  value: { fontFamily: fonts.regular, fontSize: 15, color: colors.textSecondary, maxWidth: '45%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: fonts.medium, fontSize: 22, color: colors.onNavy, letterSpacing: 1 },
  name: { fontFamily: fonts.light, fontSize: 26, letterSpacing: -0.3, color: colors.navy },
});
