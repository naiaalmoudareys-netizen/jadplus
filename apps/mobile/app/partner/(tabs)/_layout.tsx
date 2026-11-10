/**
 * Technician and partner office tabs (R3): Today · Jobs · Done · Profile. Today is the partner's start page
 * (/partner); a job opens over the tabs (/partner/job/[id]).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useT } from '../../../src/i18n/I18nProvider.js';
import { useSession } from '../../../src/session/SessionProvider.js';
import { colors, fonts } from '../../../src/ui/theme.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }): ReactNode => (
    // The tab bar passes our own colours (strings); anything else falls back to the icon's default.
    <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
  );

export default function PartnerTabs(): ReactNode {
  const session = useSession();
  const t = useT();
  if (session.status !== 'signed_in') return <Redirect href="/" />;
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
        options={{ title: t('partner.tab.today'), tabBarIcon: icon('today-outline') }}
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
