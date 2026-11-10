/**
 * The app language (ADR 0016). The person's choice is kept on the phone (so the sign-in screen is already in
 * their language) and in their JAD+ account (so messages can follow it). Arabic turns the whole layout right
 * to left at once, without restarting the app.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@jadplus/shared';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { DICTIONARY, type MessageKey } from './dictionary.js';
import { LANGUAGE_INFO, type LanguageInfo } from './languages.js';
import { fill, type Params } from './translate.js';

const KEY = 'jadplus.language';

export type Translate = (key: MessageKey, params?: Params) => string;

export interface I18n {
  readonly language: Language;
  readonly info: LanguageInfo;
  /** True once the person has picked a language on this phone (otherwise their account's is used). */
  readonly chosen: boolean;
  readonly t: Translate;
  readonly setLanguage: (language: Language) => void;
}

const I18nContext = createContext<I18n | null>(null);

const asLanguage = (value: string | null): Language | null => LANGUAGES.find((l) => l === value) ?? null;

export function translator(language: Language): Translate {
  const table = DICTIONARY[language];
  return (key, params) => fill(table[key], params);
}

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<{ language: Language; chosen: boolean } | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((stored) => {
        const language = asLanguage(stored);
        setState({ language: language ?? DEFAULT_LANGUAGE, chosen: language !== null });
      })
      .catch(() => {
        setState({ language: DEFAULT_LANGUAGE, chosen: false });
      });
  }, []);

  const setLanguage = useCallback((language: Language) => {
    setState({ language, chosen: true });
    // Not secret, but kept with the app's other settings; a failed save only means asking again next time.
    SecureStore.setItemAsync(KEY, language).catch(() => undefined);
  }, []);

  const value = useMemo<I18n | null>(
    () =>
      state === null
        ? null
        : {
            language: state.language,
            info: LANGUAGE_INFO[state.language],
            chosen: state.chosen,
            t: translator(state.language),
            setLanguage,
          },
    [state, setLanguage],
  );
  if (value === null) return null;
  return (
    <I18nContext value={value}>
      <View style={[styles.fill, value.info.rtl ? styles.rtl : styles.ltr]}>{children}</View>
    </I18nContext>
  );
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (i18n === null) throw new Error('useI18n must be used inside I18nProvider');
  return i18n;
}

/** The translate function for the current language. */
export function useT(): Translate {
  return useI18n().t;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
});
