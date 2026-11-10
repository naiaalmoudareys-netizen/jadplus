/**
 * The translate function and the person's locale as one small value (ADR 0016), kept free of React Native so
 * the formatting helpers that take it are tested in plain Node. Screens get it from `useLang()`.
 */
import type { Language } from '@jadplus/shared';
import { DICTIONARY, type MessageKey } from './dictionary.js';
import { LANGUAGE_INFO } from './languages.js';
import { fill, type Params } from './translate.js';

export type Translate = (key: MessageKey, params?: Params) => string;

/** What a helper needs to word and date something in the person's language. */
export interface Lang {
  readonly t: Translate;
  /** BCP 47 locale for dates and numbers, e.g. 'ar-AE'. */
  readonly locale: string;
}

export function translator(language: Language): Translate {
  const table = DICTIONARY[language];
  return (key, params) => fill(table[key], params);
}

export function langOf(language: Language): Lang {
  return { t: translator(language), locale: LANGUAGE_INFO[language].locale };
}

/** True for a key the dictionary knows, so codes from the API can be looked up safely. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(DICTIONARY.en, key);
}

/**
 * English keeps the app's own hand-built wording ("Tue 10 Nov", "AED 1,250,000"), identical on every phone;
 * other languages use the phone's Intl formats.
 */
export function isEnglish(locale: string): boolean {
  return locale === 'en' || locale.startsWith('en-');
}

/**
 * Western digits in every language (the UAE convention for prices, dates and references), so an Arabic
 * screen shows "10 نوفمبر 2026" the same on iPhone and Android. `locale` is a plain tag such as 'ar-AE'.
 */
export function latinDigits(locale: string): string {
  return `${locale}-u-nu-latn`;
}
