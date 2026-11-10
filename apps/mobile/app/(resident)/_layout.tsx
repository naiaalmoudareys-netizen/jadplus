/**
 * Owner and tenant tabs (Naya, 10-Nov-2026): Home · My unit · Payments · Requests · Profile for owners (news &
 * offers at the end of Home, construction at the end of My unit); Home · Requests · Profile for tenants (the
 * unit's payments and owner news are the owner's).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { PortalProvider } from '../../src/portal/PortalProvider.js';
import { useT } from '../../src/i18n/I18nProvider.js';
import { useSession } from '../../src/session/SessionProvider.js';
import { colors, fonts } from '../../src/ui/theme.js';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }): ReactNode => (
    // The tab bar passes our own colours (strings); anything else falls back to the icon's default.
    <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
  );

export default function ResidentTabs(): ReactNode {
  const session = useSession();
  const t = useT();
  if (session.status !== 'signed_in') return <Redirect href="/" />;
  const owner = session.me.role === 'owner';
  const tabs = (
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
      <Tabs.Screen name="home" options={{ title: t('tab.home'), tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen
        name="unit"
        options={{ title: t('tab.unit'), tabBarIcon: icon('business-outline'), href: owner ? '/unit' : null }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: t('tab.payments'),
          tabBarIcon: icon('card-outline'),
          href: owner ? '/payments' : null,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: t('tab.requests'), tabBarIcon: icon('construct-outline') }}
      />
      {/* Opened from "See all" on Home; not shown in the bar. */}
      <Tabs.Screen name="news" options={{ title: t('tab.news'), href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('tab.profile'), tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
  // Owner data (Salesforce, or demo) is loaded once for all owner tabs; tenants never request it.
  return owner ? <PortalProvider>{tabs}</PortalProvider> : tabs;
}
