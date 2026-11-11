/**
 * How the owner pays the partner (ADR 0026, ADR 0009; Naya 11-Nov-2026): bank details (bank, account name,
 * IBAN, account number) and payment links are welcome; phone numbers, emails and messenger links are not,
 * because all contact stays on JAD+ (P2).
 *
 * The message filter (conversation.ts) cannot be reused: it would take an IBAN or account number for a phone
 * number. Here a phone number is only a number written the way phones are: international (+ or 00 then 9-15
 * digits), a UAE mobile (05 and 10 digits) or a UAE landline (0 then 2-9, 9 digits). One pass, no regular
 * expressions over the whole text, so a crafted text cannot make it slow.
 */

/** Hosts of links that move a conversation to another app. */
const MESSENGER_HOSTS = ['wa.me/', 'whatsapp.com/', 't.me/', 'telegram.me/', 'viber.com/'];
/** Characters that may sit between the digits of a written phone number. */
const SEPARATORS = new Set([' ', '.', '-', '(', ')']);

export const PAYMENT_TEXT_CONTACT_PROBLEM =
  'Please leave out phone numbers, emails and chat links: owners contact you through JAD+. Bank details and payment links are fine.';

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);

function looksLikePhone(digits: string, international: boolean): boolean {
  if (international) return digits.length >= 9 && digits.length <= 15;
  if (digits.startsWith('05')) return digits.length === 10;
  return digits.length === 9 && digits.startsWith('0') && digits.charAt(1) >= '2';
}

/** True when a run of digits written like a phone number appears (not part of an IBAN or a word). */
function hasPhone(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const startsNumber = isDigit(ch) || (ch === '+' && isDigit(text.charAt(i + 1)));
    // Digits glued to letters ("AE07 0331…", "INV2026…") belong to an IBAN or a reference.
    if (!startsNumber || (i > 0 && isLetter(text.charAt(i - 1)))) {
      i += 1;
      continue;
    }
    let digits = '';
    let end = i;
    let gap = 0;
    while (end < text.length) {
      const c = text.charAt(end);
      if (isDigit(c)) {
        digits += c;
        gap = 0;
      } else if ((SEPARATORS.has(c) && gap < 2) || (c === '+' && end === i)) {
        gap += 1;
      } else {
        break;
      }
      end += 1;
    }
    const international = ch === '+' || digits.startsWith('00');
    const national = international && digits.startsWith('00') ? digits.slice(2) : digits;
    if (looksLikePhone(national, international)) return true;
    i = Math.max(end, i + 1);
  }
  return false;
}

/** An email address or a messenger link among the words. */
function hasContactWord(text: string): boolean {
  return text.split(/\s+/).some((word) => {
    const lower = word.toLowerCase();
    if (MESSENGER_HOSTS.some((host) => lower.includes(host))) return true;
    const at = lower.indexOf('@');
    return at > 0 && lower.indexOf('.', at + 2) > at + 1;
  });
}

/** P2/ADR 0026: why these payment instructions cannot be saved, or null when they can. */
export function paymentTextProblem(text: string): string | null {
  return hasContactWord(text) || hasPhone(text) ? PAYMENT_TEXT_CONTACT_PROBLEM : null;
}
