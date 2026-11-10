/**
 * Owner and tenant tabs (docs/DESIGN.md): Home · My unit · Payments · News · Progress · Profile for owners;
 * Home · Profile for tenants (their unit's payments and news belong to the owner). Services join in phase B.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { PortalProvider } from '../../src/portal/PortalProvider.js';
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
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen
        name="unit"
        options={{ title: 'My unit', tabBarIcon: icon('business-outline'), href: owner ? '/unit' : null }}
      />
      <Tabs.Screen
        name="payments"
        options={{ title: 'Payments', tabBarIcon: icon('card-outline'), href: owner ? '/payments' : null }}
      />
      <Tabs.Screen
        name="news"
        options={{ title: 'News', tabBarIcon: icon('newspaper-outline'), href: owner ? '/news' : null }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: icon('construct-outline'),
          href: owner ? '/progress' : null,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
  // Owner data (Salesforce, or demo) is loaded once for all owner tabs; tenants never request it.
  return owner ? <PortalProvider>{tabs}</PortalProvider> : tabs;
}
