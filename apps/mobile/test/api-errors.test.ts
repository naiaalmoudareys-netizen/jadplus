/** Failed calls in the person's language (ADR 0016): the API's own words as received, the app's translated. */
import { describe, expect, it } from 'vitest';
import { ApiError, errorText } from '../src/api/client.js';
import { translator } from '../src/i18n/lang.js';

describe('errorText', () => {
  const fr = translator('fr');

  it('shows the API message as received, in every language', () => {
    expect(errorText(new ApiError(429, 'Too many attempts. Please wait and try again.'), fr)).toBe(
      'Too many attempts. Please wait and try again.',
    );
  });

  it("words the app's own reasons in the person's language", () => {
    expect(errorText(new ApiError(0, 'offline', null, 'offline'), fr)).toBe(fr('access.offline'));
    expect(errorText(new ApiError(500, 'unexpected', null, 'unexpected'), fr)).toBe(fr('common.error'));
    expect(errorText(new Error('boom'), fr)).toBe(fr('common.error'));
  });
});
