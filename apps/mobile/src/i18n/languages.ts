/**
 * The app's languages (ADR 0016; Naya, 10-Nov-2026: English, Arabic, French, Russian, Chinese). Each name is
 * written in its own language so a person can always find theirs. Arabic is read right to left.
 */
import type { Language } from '@jadplus/shared';

export interface LanguageInfo {
  readonly code: Language;
  /** The name in that language ("العربية"). */
  readonly nativeName: string;
  /** The name in English, under it. */
  readonly englishName: string;
  /** Used for dates and numbers. */
  readonly locale: string;
  readonly rtl: boolean;
}

export const LANGUAGE_INFO: Readonly<Record<Language, LanguageInfo>> = {
  en: { code: 'en', nativeName: 'English', englishName: 'English', locale: 'en-GB', rtl: false },
  ar: { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', locale: 'ar-AE', rtl: true },
  fr: { code: 'fr', nativeName: 'Français', englishName: 'French', locale: 'fr-FR', rtl: false },
  ru: { code: 'ru', nativeName: 'Русский', englishName: 'Russian', locale: 'ru-RU', rtl: false },
  zh: {
    code: 'zh',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    locale: 'zh-CN',
    rtl: false,
  },
};
