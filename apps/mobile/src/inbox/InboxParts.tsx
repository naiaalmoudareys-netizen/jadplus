/**
 * The notifications pieces (ADR 0019): the bell on Home with its unread badge, one notification row, and the
 * calm "all caught up" state. The words come from wording.ts, in the person's language.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { InboxItem } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/I18nProvider.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';
import { badgeText, inboxText, inboxTime, type InboxText } from './wording.js';

/**
 * A round bell with a small bronze badge carrying the unread count ("9+" above nine): light on the Home photo,
 * navy on a plain header (the technician's Today).
 */
export function InboxBell({
  unread,
  onPress,
  onPaper = false,
}: {
  unread: number;
  onPress: () => void;
  onPaper?: boolean;
}): ReactNode {
  const { t } = useLang();
  const badge = badgeText(unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge === null ? t('inbox.bell') : t('inbox.bellUnread', { count: unread })}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.bell, onPaper && styles.bellOnPaper, pressed && styles.pressed]}
    >
      <Ionicons name="notifications-outline" size={20} color={onPaper ? colors.navy : colors.onNavy} />
      {badge === null ? null : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** One notification: icon, bold title, one line in the person's language, when, and a dot while unread. */
export function InboxRow({
  item,
  now,
  onPress,
}: {
  item: InboxItem;
  now: number;
  onPress: () => void;
}): ReactNode {
  const lang = useLang();
  const text = inboxText(item, lang);
  const when = inboxTime(item.at, now, lang);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.read ? null : lang.t('inbox.unread'), text.title, text.detail, when]
        .filter((x) => x !== null)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !item.read && styles.unreadRow, pressed && styles.pressed]}
    >
      <View style={[styles.icon, text.needsYou && styles.iconNeedsYou, text.urgent && styles.iconUrgent]}>
        <Ionicons name={text.icon} size={20} color={iconColor(text)} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, !item.read && styles.titleUnread, text.urgent && styles.titleUrgent]}
            numberOfLines={1}
          >
            {text.title}
          </Text>
          <Text style={styles.time}>{when}</Text>
        </View>
        <Text style={styles.detail} numberOfLines={1}>
          {text.detail}
        </Text>
      </View>
      <View style={[styles.dot, item.read && styles.dotRead]} />
    </Pressable>
  );
}

function iconColor(text: InboxText): string {
  if (text.urgent) return colors.urgent;
  return text.needsYou ? colors.bronze : colors.slate;
}

/** Nothing to show: a quiet bell and one plain sentence (worded for the partner on a partner account). */
export function InboxEmpty({ partner = false }: { partner?: boolean }): ReactNode {
  const { t } = useLang();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="notifications-off-outline" size={28} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
      <Text style={styles.emptyText}>{t(partner ? 'inbox.partnerEmptyText' : 'inbox.emptyText')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,240,235,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244,240,235,0.45)',
  },
  bellOnPaper: { backgroundColor: colors.card, borderColor: colors.line },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bronze,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onNavy },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius,
    backgroundColor: colors.card,
    ...cardShadow,
  },
  unreadRow: { backgroundColor: colors.mistSoft },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  iconNeedsYou: { backgroundColor: colors.warnSoft },
  iconUrgent: { backgroundColor: colors.urgentSoft },
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  titleUnread: { fontFamily: fonts.semibold, color: colors.navy },
  titleUrgent: { color: colors.urgent },
  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  detail: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bronze },
  dotRead: { backgroundColor: 'transparent' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl * 2, paddingHorizontal: space.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
    marginBottom: space.sm,
  },
  emptyTitle: { fontFamily: fonts.light, fontSize: 22, color: colors.navy, textAlign: 'center' },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
