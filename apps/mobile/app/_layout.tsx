/**
 * App frame: JAD+ fonts and colours (docs/DESIGN.md), the language (ADR 0016), the session and the person's
 * settings for every screen, and one navigation stack.
 */
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
import { I18nProvider, useT } from '../src/i18n/I18nProvider.js';
import { PreferencesProvider } from '../src/profile/PreferencesProvider.js';
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
      <I18nProvider>
        <SessionProvider>
          <PreferencesProvider>
            <StatusBar style="dark" />
            <Screens />
          </PreferencesProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Screens(): ReactNode {
  const t = useT();
  return (
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
      <Stack.Screen name="partner/(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="partner/job/[id]" options={{ title: t('title.job') }} />
      <Stack.Screen name="emergency" options={{ title: t('title.emergency') }} />
      <Stack.Screen name="request/[id]" options={{ title: t('title.request') }} />
      <Stack.Screen name="notifications" options={{ title: t('inbox.title') }} />
      <Stack.Screen name="new-request" options={{ title: t('title.newRequest') }} />
      <Stack.Screen name="desk-request" options={{ title: t('title.desk') }} />
      <Stack.Screen name="guide" options={{ title: t('guide.title') }} />
      <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
    </Stack>
  );
}
