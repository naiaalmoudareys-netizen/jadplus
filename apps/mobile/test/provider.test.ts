/** The provider badge on requests (S8; ADR 0030), in the five languages. */
import { LANGUAGES } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { translator } from '../src/i18n/lang.js';
import { providerBadge } from '../src/requests/provider.js';

describe('provider badge (S8, ADR 0030)', () => {
  it('a JAD Global team shows "JAD Global team" instead of "JAD+ verified"', () => {
    expect(providerBadge('jad_group', true)).toBe('jad_team');
    expect(providerBadge('jad_group', false)).toBe('jad_team');
  });

  it('S8: an outside partner shows "JAD+ verified" only while in good standing', () => {
    expect(providerBadge('external', true)).toBe('verified');
    expect(providerBadge('external', false)).toBeNull();
    expect(providerBadge(null, false)).toBeNull();
  });

  it('ADR 0016: the badge reads in every language, never as its key', () => {
    expect(translator('en')('help.jadTeam')).toBe('JAD Global team');
    for (const lang of LANGUAGES) {
      const t = translator(lang);
      expect(t('help.jadTeam')).not.toBe('help.jadTeam');
      expect(t('help.jadTeam')).toContain('JAD Global');
    }
  });
});
