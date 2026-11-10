/** Translations (ADR 0016): every language complete, same {marks} as English, nothing empty. */
import { LANGUAGES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { DICTIONARY, PARTS } from '../src/i18n/dictionary.js';
import { fill, marks } from '../src/i18n/translate.js';

const english = DICTIONARY.en;
const keys = Object.keys(english) as (keyof typeof english)[];

describe('translations', () => {
  it('every language has every English key, none empty, none extra', () => {
    for (const language of LANGUAGES) {
      const table = DICTIONARY[language];
      expect(Object.keys(table).sort()).toEqual([...keys].sort());
      for (const key of keys) expect(table[key].trim(), `${language} ${key}`).not.toBe('');
    }
  });

  it('every translation keeps the same {marks} as English', () => {
    for (const language of LANGUAGES) {
      for (const key of keys) {
        expect(marks(DICTIONARY[language][key]), `${language} ${key}`).toEqual(marks(english[key]));
      }
    }
  });

  it('no key is defined in two parts of the app (one would silently hide the other)', () => {
    const seen = new Set<string>();
    for (const part of PARTS) {
      for (const key of Object.keys(part.en)) {
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it('fills {marks} with values and leaves unknown ones visible', () => {
    expect(fill('Switch to {role}', { role: 'Tenant' })).toBe('Switch to Tenant');
    expect(fill('Residences: {count}', { count: 2 })).toBe('Residences: 2');
    expect(fill('Hello {name}')).toBe('Hello {name}');
  });
});
