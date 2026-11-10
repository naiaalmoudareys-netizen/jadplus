/**
 * Building notices on Home and the rows of the home guide (V1; ADR 0025). Each row opens with one tap to show
 * the text JAD+ wrote, as written; screen readers hear a button and whether it is open.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { myNotices } from '../api/endpoints.js';
import { useI18n, useLang } from '../i18n/I18nProvider.js';
import { useSessionController } from '../session/SessionProvider.js';
import { useLoad, useNow } from '../ui/hooks.js';
import { cardShadow, colors, fonts, radius, space } from '../ui/theme.js';
import { NOTICE_ICONS, noticeKindLabel, noticeSpan, orderNotices } from './wording.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

const REFRESH_MS = 5 * 60_000;

/** One row that opens to show its text: icon, a small label, the title and a line under it. */
export function OpenableRow(props: {
  icon: IconName;
  label: string;
  title: string;
  detail: string | null;
  body: string;
  tag?: string | null;
  first: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => {
        setOpen((o) => !o);
      }}
      style={({ pressed }) => [styles.row, !props.first && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Ionicons name={props.icon} size={20} color={colors.slate} />
      </View>
      <View style={styles.text}>
        <View style={styles.labels}>
          <Text style={styles.label}>{props.label.toUpperCase()}</Text>
          {props.tag === undefined || props.tag === null ? null : (
            <Text style={styles.tag}>{props.tag.toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.title}>{props.title}</Text>
        {props.detail === null ? null : <Text style={styles.detail}>{props.detail}</Text>}
        {open ? <Text style={styles.body}>{props.body}</Text> : null}
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
    </Pressable>
  );
}

/** A card of rows under a small heading. */
export function RowsCard({ title, children }: { title: string | null; children: ReactNode }): ReactNode {
  return (
    <View style={styles.group}>
      {title === null ? null : <Text style={styles.heading}>{title.toUpperCase()}</Text>}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** V1: current and upcoming notices for the person's buildings; nothing at all when there are none. */
export function BuildingNotices(): ReactNode {
  const { api } = useSessionController();
  const lang = useLang();
  const now = useNow(60_000);
  const load = useCallback(() => myNotices(api), [api]);
  const notices = useLoad(load, REFRESH_MS);
  const { reload } = notices;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const shown = orderNotices(notices.data ?? []);
  if (shown.length === 0) return null;
  return (
    <RowsCard title={lang.t('building.notices')}>
      {shown.map((n, i) => (
        <OpenableRow
          key={n.id}
          first={i === 0}
          icon={NOTICE_ICONS[n.kind]}
          label={noticeKindLabel(n.kind, lang.t)}
          tag={n.state === 'upcoming' ? lang.t('building.upcoming') : null}
          title={n.title}
          detail={noticeSpan(n, now, lang)}
          body={n.body}
        />
      ))}
    </RowsCard>
  );
}

/** A quiet link to the home guide (My unit, the tenant's home card). */
export function GuideLink(): ReactNode {
  const router = useRouter();
  const { t, info } = useI18n();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        router.push('/guide');
      }}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Ionicons name="book-outline" size={20} color={colors.slate} />
      <View style={styles.text}>
        <Text style={styles.linkTitle}>{t('guide.title')}</Text>
        <Text style={styles.detail}>{t('guide.linkNote')}</Text>
      </View>
      <Ionicons name={info.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  heading: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: space.md, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pressed: { opacity: 0.6 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mistSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2, color: colors.bronze },
  tag: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2, color: colors.warn },
  title: { fontFamily: fonts.medium, fontSize: 16, color: colors.navy },
  detail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text, marginTop: space.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  linkTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.slate },
});
