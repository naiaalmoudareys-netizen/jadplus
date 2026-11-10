/** Language row and its pop-up list (ADR 0016): each language written in its own script, English below. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { LANGUAGES, type Language } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/I18nProvider.js';
import { LANGUAGE_INFO } from '../i18n/languages.js';
import { colors, fonts, radius, space } from '../ui/theme.js';
import { usePreferences } from './PreferencesProvider.js';
import { SettingsRow } from './ProfileParts.js';

export function LanguageRow({ bare = false }: { bare?: boolean }): ReactNode {
  const { t, info, language, setLanguage } = useI18n();
  const { prefs, change } = usePreferences();
  const [open, setOpen] = useState(false);

  const choose = (next: Language) => {
    setOpen(false);
    if (next === language) return;
    // Signed in: saved to the account too (and on the phone). Not signed in yet: on the phone only.
    if (prefs === null) setLanguage(next);
    else change({ language: next }).catch(() => undefined);
  };

  const row = (
    <SettingsRow
      icon="language-outline"
      title={t('profile.language')}
      value={info.nativeName}
      onPress={() => {
        setOpen(true);
      }}
    />
  );
  return (
    <>
      {bare ? row : <View style={styles.card}>{row}</View>}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setOpen(false);
        }}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel={t('common.close')}
            style={styles.dismiss}
            onPress={() => {
              setOpen(false);
            }}
          />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <Text style={styles.title}>{t('profile.chooseLanguage')}</Text>
            {LANGUAGES.map((code) => {
              const l = LANGUAGE_INFO[code];
              const selected = code === language;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${l.nativeName}, ${l.englishName}`}
                  onPress={() => {
                    choose(code);
                  }}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <View style={styles.optionText}>
                    <Text style={[styles.native, selected && styles.selected]}>{l.nativeName}</Text>
                    <Text style={styles.english}>{l.englishName}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark" size={22} color={colors.slate} /> : null}
                </Pressable>
              );
            })}
            <Text style={styles.note}>{t('profile.languageNote')}</Text>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: space.md },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,2,41,0.45)' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius * 1.5,
    borderTopRightRadius: radius * 1.5,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.xs,
  },
  title: { fontFamily: fonts.light, fontSize: 24, color: colors.navy, marginBottom: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  optionText: { flex: 1, gap: 2 },
  native: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  selected: { color: colors.slate },
  english: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  note: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    paddingVertical: space.md,
  },
});
