/** Shows a legal text (terms or privacy), with its version and the draft / English-only notes (ADR 0016). */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nProvider.js';
import { colors, fonts, space } from '../ui/theme.js';
import type { LegalText } from './texts.js';

export function LegalReader({ text }: { text: LegalText }): ReactNode {
  const { t, language } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>
        {`${t('legal.draft')} · ${t('legal.version', { version: text.version })}`.toUpperCase()}
      </Text>
      {language === 'en' ? null : <Text style={styles.note}>{t('legal.englishOnly')}</Text>}
      {/* The legal text is English (the reference); it is always laid out left to right. */}
      <View style={styles.english}>
        <Text style={styles.title}>{text.title}</Text>
        {text.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((p) => (
              <Text key={p.slice(0, 40)} style={styles.body}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  english: { direction: 'ltr', gap: space.md },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, color: colors.bronze },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  title: { fontFamily: fonts.light, fontSize: 26, color: colors.navy, textAlign: 'left' },
  section: { gap: space.xs },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.navy, textAlign: 'left' },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'left' },
});
