/**
 * Technician and partner office tabs (R3): Today · Jobs · Done · Profile. Today is the partner's start page
 * (/partner); a job opens over the tabs (/partner/job/[id]). Today's header carries the notifications bell
 * (ADR 0024) and its tab shows the unread count, read again whenever the tabs come back into view and every
 * minute while they are shown.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { InboxBell } from '../../../src/inbox/InboxParts.js';
import { useUnread } from '../../../src/inbox/useUnread.js';
import { badgeText } from '../../../src/inbox/wording.js';
import { useSession, useSessionController } from '../../../src/session/SessionProvider.js';
import { colors, fonts, space } from '../../../src/ui/theme.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }): ReactNode => (
    // The tab bar passes our own colours (strings); anything else falls back to the icon's default.
    <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
  );

export default function PartnerTabs(): ReactNode {
  const session = useSession();
  const { api } = useSessionController();
  const router = useRouter();
  const t = useT();
  const unread = useUnread(api);
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  const badge = badgeText(unread);
  const bell = (): ReactNode => (
    <View style={styles.bell}>
      <InboxBell
        unread={unread}
        onPaper
        onPress={() => {
          router.push('/notifications');
        }}
      />
    </View>
  );
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.navy,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.medium, fontSize: 15 },
        tabBarActiveTintColor: colors.slate,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.6 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('partner.tab.today'),
          tabBarIcon: icon('today-outline'),
          headerRight: bell,
          tabBarBadgeStyle: styles.badge,
          ...(badge === null ? {} : { tabBarBadge: badge }),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: t('partner.tab.jobs'), tabBarIcon: icon('construct-outline') }}
      />
      <Tabs.Screen
        name="done"
        options={{ title: t('partner.tab.done'), tabBarIcon: icon('checkmark-done-outline') }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tab.profile'), tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { marginHorizontal: space.md },
  badge: { backgroundColor: colors.bronze, color: colors.onNavy, fontFamily: fonts.bold, fontSize: 10 },
});
