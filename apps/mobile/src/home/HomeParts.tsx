/** Building blocks of the Home screen (ADR 0014): shortcuts, "needs your attention", news cards, progress. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { dubaiDate, isOffer, newsFeed, type ConstructionUpdate, type OwnerPost } from '@jadplus/shared';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { longDate } from '../portal/format.js';
import { useLang, useT } from '../i18n/I18nProvider.js';
import { newsKind } from '../portal/NewsSection.js';
import { Photo } from '../portal/Photo.js';
import { ProgressBar } from '../portal/ui.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';
import type { AttentionItem } from './attention.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface Shortcut {
  readonly label: string;
  readonly icon: IconName;
  readonly urgent?: boolean;
  readonly onPress: () => void;
}

/** Round one-tap shortcuts; the emergency one is red. */
export function Shortcuts({ items }: { items: readonly Shortcut[] }): ReactNode {
  return (
    <View style={styles.shortcuts}>
      {items.map((s) => (
        <Pressable
          key={s.label}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          onPress={s.onPress}
          style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
        >
          <View style={[styles.circle, s.urgent === true && styles.urgentCircle]}>
            <Ionicons name={s.icon} size={24} color={s.urgent === true ? colors.onNavy : colors.slate} />
          </View>
          <Text style={[styles.shortcutLabel, s.urgent === true && styles.urgentText]}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const ATTENTION_ICON: Readonly<Record<AttentionItem['kind'], IconName>> = {
  emergency: 'warning-outline',
  approval: 'person-outline',
  quote: 'document-text-outline',
  confirm: 'checkmark-circle-outline',
  arriving: 'time-outline',
  overdue: 'card-outline',
  invoice: 'receipt-outline',
};

/** Only shown when something needs the owner now. */
export function Attention({
  items,
  onPress,
}: {
  items: readonly AttentionItem[];
  onPress: (i: AttentionItem) => void;
}): ReactNode {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <View style={styles.attention}>
      <Text style={styles.eyebrow}>{t('owner.home.needsAttention').toUpperCase()}</Text>
      {items.map((item) => (
        <Pressable
          key={`${item.kind}:${'requestId' in item.target ? item.target.requestId : 'payments'}`}
          accessibilityRole="button"
          onPress={() => {
            onPress(item);
          }}
          style={({ pressed }) => [styles.attentionRow, pressed && styles.pressed]}
        >
          <Ionicons
            name={ATTENTION_ICON[item.kind]}
            size={20}
            color={item.kind === 'emergency' || item.kind === 'overdue' ? colors.urgent : colors.slate}
          />
          <View style={styles.attentionText}>
            <Text style={styles.attentionTitle}>{item.title}</Text>
            {item.detail === '' ? null : <Text style={styles.attentionDetail}>{item.detail}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** A section title with an optional "See all" link on the right. */
export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}): ReactNode {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.heading}>{title.toUpperCase()}</Text>
      {action === undefined ? null : (
        <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={12}>
          <Text style={styles.link}>{action.label.toUpperCase()}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** One line of construction progress for the owner's project; opens My unit. */
export function ConstructionLine({
  update,
  onPress,
}: {
  update: ConstructionUpdate | null;
  onPress: () => void;
}): ReactNode {
  const t = useT();
  if (update === null) return null;
  const { percent } = update;
  if (percent === null) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.eyebrow}>
        {`${t('owner.construction.title')} · ${update.project ?? ''}`.toUpperCase()}
      </Text>
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <ProgressBar percent={percent} />
        </View>
        <Text style={styles.percent}>{`${String(Math.round(percent))}%`}</Text>
      </View>
      <Text style={styles.attentionDetail}>{update.title}</Text>
    </Pressable>
  );
}

/** News & offers as cards to swipe through, owners-only offers first. */
export function NewsCarousel({
  posts,
  onOpen,
}: {
  posts: readonly OwnerPost[];
  onOpen: () => void;
}): ReactNode {
  const today = dubaiDate(Date.now());
  const { t, locale } = useLang();
  const feed = newsFeed(posts, 'all', today).sort((a, b) => Number(isOffer(b)) - Number(isOffer(a)));
  if (feed.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
      {feed.slice(0, 6).map((post) => (
        <Pressable
          key={post.id}
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.newsCard, pressed && styles.pressed]}
        >
          <Photo id={post.photos[0] ?? null} project={post.project} label={post.title} />
          <Text style={[styles.eyebrow, isOffer(post) && styles.bronze]}>
            {`${isOffer(post) ? t('owner.news.ownersOnly') : newsKind(post.type, t)} · ${longDate(post.date, locale)}`.toUpperCase()}
          </Text>
          <Text style={styles.newsTitle} numberOfLines={2}>
            {post.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  shortcuts: { flexDirection: 'row', justifyContent: 'space-between' },
  shortcut: { alignItems: 'center', gap: 6, flex: 1, minHeight: 44 },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  urgentCircle: { backgroundColor: colors.urgent },
  shortcutLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  urgentText: { color: colors.urgent },
  attention: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.sm,
    ...cardShadow,
  },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  attentionText: { flex: 1, gap: 2 },
  attentionTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  attentionDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2, color: colors.muted },
  bronze: { color: colors.bronze },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.sm,
  },
  heading: { fontFamily: fonts.light, fontSize: 22, letterSpacing: -0.3, color: colors.navy },
  link: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.slate },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.md,
    gap: space.sm,
    ...cardShadow,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressBar: { flex: 1 },
  percent: { fontFamily: fonts.medium, fontSize: 15, color: colors.navy },
  carousel: { gap: space.md, paddingRight: space.lg },
  newsCard: {
    width: 250,
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space.sm,
    gap: space.sm,
    ...cardShadow,
  },
  newsTitle: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 21, color: colors.navy },
});
