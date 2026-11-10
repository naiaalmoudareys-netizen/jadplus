/** App frame: session for every screen, one navigation stack, JAD navy header. */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider.js';
import { colors } from '../src/ui/theme.js';

export default function RootLayout(): ReactNode {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy },
            headerTintColor: colors.onNavy,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'JAD+', headerBackVisible: false }} />
          <Stack.Screen name="home" options={{ title: 'JAD+', headerBackVisible: false }} />
          <Stack.Screen name="partner/index" options={{ title: 'My jobs', headerBackVisible: false }} />
          <Stack.Screen name="partner/job/[id]" options={{ title: 'Job' }} />
          <Stack.Screen name="emergency" options={{ title: 'Emergency' }} />
          <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
          <Stack.Screen name="settings" options={{ title: 'Account' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
