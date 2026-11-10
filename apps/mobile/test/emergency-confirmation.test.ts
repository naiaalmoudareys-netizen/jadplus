/** L3: the emergency confirmation is the spec's exact English, and the same sentence in other languages. */
import { emergencyConfirmationText } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { confirmationText } from '../src/emergency/confirmation.js';
import { translator } from '../src/i18n/lang.js';

describe('emergency confirmation (L3)', () => {
  it('L3: English stays byte-for-byte the API text', () => {
    const api = emergencyConfirmationText('Demo Maintenance LLC');
    expect(confirmationText(api, translator('en'))).toBe(api);
  });

  it('L3: other languages keep the provider name and the 999 number', () => {
    const api = emergencyConfirmationText('Demo Maintenance LLC');
    const text = confirmationText(api, translator('fr'));
    expect(text).toBe(
      "Votre urgence a été transmise à Demo Maintenance LLC. Si quelqu'un est en danger, appelez le 999.",
    );
    expect(confirmationText(api, translator('ar'))).toContain('Demo Maintenance LLC');
    expect(confirmationText(api, translator('zh'))).toContain('999');
  });

  it('shows any other text exactly as the API sent it', () => {
    expect(confirmationText('Something else.', translator('ru'))).toBe('Something else.');
  });
});
