/**
 * L3: the emergency confirmation in the person's language. The API sends the one allowed English text
 * (packages/shared emergencyConfirmationText); the app takes the provider's name from it and words the same
 * sentence in the person's language. Any other text is shown exactly as the API sent it.
 */
import type { Translate } from '../i18n/lang.js';

const ENGLISH = /^Your emergency has been sent to (.+)\. If anyone is in danger, call 999\.$/s;

export function confirmationText(confirmation: string, t: Translate): string {
  const provider = ENGLISH.exec(confirmation)?.[1];
  return provider === undefined ? confirmation : t('req.emergency.confirmation', { provider });
}
