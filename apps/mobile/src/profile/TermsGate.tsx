/**
 * Accepting the terms (L1): shown over the app until the person has accepted the current version. Marketing
 * consent is a separate, optional switch that starts off (L2 "separate marketing consent"). Both are recorded
 * with version, time and IP hash by the API.
 */
import { MARKETING_VERSION, TERMS_VERSION } from '@jadplus/shared';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/I18nProvider.js';
import { LegalReader } from '../legal/LegalReader.js';
import { LEGAL_TEXTS, type LegalDoc } from '../legal/texts.js';
import { useSessionController } from '../session/SessionProvider.js';
import { Button, Eyebrow, Heading, Notice } from '../ui/kit.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { LanguageRow } from './LanguagePicker.js';
import { usePreferences } from './PreferencesProvider.js';

export function TermsGate(): ReactNode {
  const { t } = useI18n();
  const { prefs, consent } = usePreferences();
  const controller = useSessionController();
  const router = useRouter();
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      if (marketing) await consent({ kind: 'marketing', version: MARKETING_VERSION, accepted: true });
      await consent({ kind: 'terms', version: TERMS_VERSION, accepted: true });
    } catch {
      setError(t('common.error'));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.cover}>
      <ScrollView contentContainerStyle={styles.content}>
        {reading === null ? (
          <>
            <Eyebrow>{t('legal.welcome')}</Eyebrow>
            <Heading>{t('legal.title')}</Heading>
            <Text style={styles.body}>{prefs?.terms === null ? t('legal.intro') : t('legal.changed')}</Text>
            <LanguageRow />
            <View style={styles.card}>
              {(['terms', 'privacy'] as const).map((doc) => (
                <Pressable
                  key={doc}
                  accessibilityRole="button"
                  onPress={() => {
                    setReading(doc);
                  }}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>
                    {doc === 'terms' ? t('profile.terms') : t('profile.privacyNotice')}
                  </Text>
                  <Text style={styles.link}>{t('legal.read').toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t('legal.agree')}</Text>
              <Switch
                accessibilityLabel={t('legal.agree')}
                value={agree}
                onValueChange={setAgree}
                trackColor={{ true: colors.slate, false: colors.line }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t('profile.marketingNote')}</Text>
              <Switch
                accessibilityLabel={t('profile.marketing')}
                value={marketing}
                onValueChange={setMarketing}
                trackColor={{ true: colors.slate, false: colors.line }}
              />
            </View>
            {error === null ? null : <Notice tone="error">{error}</Notice>}
            <Button title={t('legal.continue')} disabled={!agree} busy={busy} onPress={() => void accept()} />
            <Button
              title={t('legal.signOut')}
              kind="secondary"
              onPress={() => {
                void controller.signOut().then(() => {
                  router.replace('/');
                });
              }}
            />
          </>
        ) : (
          <>
            <LegalReader text={LEGAL_TEXTS[reading]} />
            <Button
              title={t('common.done')}
              onPress={() => {
                setReading(null);
              }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.md },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  link: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.slate },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
});
