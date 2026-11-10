/** App frame: JAD+ fonts and colours (docs/DESIGN.md), session for every screen, one navigation stack. */
// One import per weight, so only the five weights used are bundled (not the italics).
import { HankenGrotesk_300Light } from '@expo-google-fonts/hanken-grotesk/300Light';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider.js';
import { Loading } from '../src/ui/kit.js';
import { colors, fonts } from '../src/ui/theme.js';

export default function RootLayout(): ReactNode {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_300Light,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });
  if (!fontsLoaded) return <Loading />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.navy,
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: fonts.medium, fontSize: 15 },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="(resident)" options={{ headerShown: false }} />
          <Stack.Screen name="partner/index" options={{ title: 'My jobs', headerBackVisible: false }} />
          <Stack.Screen name="partner/job/[id]" options={{ title: 'Job' }} />
          <Stack.Screen name="emergency" options={{ title: 'Emergency' }} />
          <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
          <Stack.Screen name="new-request" options={{ title: 'New request' }} />
          <Stack.Screen name="desk-request" options={{ title: 'JAD+ desk' }} />
          <Stack.Screen name="settings" options={{ title: 'Account' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
