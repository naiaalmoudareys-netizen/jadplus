/**
 * Translated text (ADR 0016). Each part of the app keeps its words in one file under `strings/`, English first
 * and every other language with exactly the same keys (the compiler refuses a missing one). `{name}` marks a
 * value filled in at run time; tests check every language keeps the same `{…}` marks as English.
 *
 * English is the reference. The other languages were drafted by Claude and must be checked by a native
 * speaker before go-live (ADR 0016), above all the emergency and legal texts.
 */
import { LANGUAGES, type Language } from '@jadplus/shared';

export type Words = Readonly<Record<string, string>>;

/** One part of the app's words, in every language, with the same keys as English. */
export type Translations<E extends Words> = { readonly en: E } & Readonly<
  Record<Exclude<Language, 'en'>, Readonly<Record<keyof E, string>>>
>;

/** Declares a part's words; the type makes every language list exactly the English keys. */
export function words<const E extends Words>(t: Translations<E>): Translations<E> {
  return t;
}

export type Params = Readonly<Record<string, string | number>>;

/** Fills `{name}` marks; a mark without a value is left as it is (and caught by tests). */
export function fill(template: string, params?: Params): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (mark, name: string) => {
    const value = params[name];
    return value === undefined ? mark : String(value);
  });
}

/** The `{…}` marks in a text, sorted, to compare languages. */
export function marks(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

/** Merges the parts into one table per language. */
export function merge(
  parts: readonly Readonly<Record<Language, Words>>[],
): Readonly<Record<Language, Words>> {
  const table: Partial<Record<Language, Words>> = {};
  for (const language of LANGUAGES) {
    table[language] = Object.assign({}, ...parts.map((p) => p[language])) as Words;
  }
  return table as Readonly<Record<Language, Words>>;
}
