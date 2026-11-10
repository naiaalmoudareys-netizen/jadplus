/**
 * Messages on a request (ADR 0009, Naya 10-Nov-2026: "all contact must be done on JAD+"; S10 "no
 * off-platform"). Residents, the assigned partner and JAD+ staff talk inside JAD+ only. Nobody sees another
 * person's phone number or email, and contact details typed into a message are removed before it is saved.
 */
import type { UserRole } from './auth.js';

export const MESSAGE_MAX_LENGTH = 1000;

export const CONTACT_REMOVED = '[contact details removed: please keep all contact in JAD+]';

/** Hosts of links that move a conversation to another app. */
const MESSENGER_HOSTS = ['wa.me/', 'whatsapp.com/', 't.me/', 'telegram.me/'];
/** Characters that may sit between the digits of a written phone number. */
const PHONE_SEPARATORS = new Set([' ', '.', '-', '(', ')']);
/**
 * A phone number has 9+ digits (UAE landlines 9 with the 0, mobiles 10, international 11+). Dates (8 digits),
 * unit names and amounts are left alone.
 */
const PHONE_MIN_DIGITS = 9;

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

/** A word that is an email address or a messenger link. */
function isContactWord(word: string): boolean {
  const lower = word.toLowerCase();
  if (MESSENGER_HOSTS.some((host) => lower.includes(host))) return true;
  const at = lower.indexOf('@');
  return at > 0 && lower.indexOf('.', at + 2) > at + 1;
}

/**
 * Replaces runs of phone-number characters holding 9+ digits. One pass over the text, no regular
 * expressions, so a crafted message cannot make it slow.
 */
function maskPhones(text: string): { text: string; masked: boolean } {
  let out = '';
  let masked = false;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (!(isDigit(ch) || ch === '+' || ch === '(')) {
      out += ch;
      i += 1;
      continue;
    }
    // Collect the run of digits and separators that starts here.
    let end = i;
    let digits = 0;
    let lastDigit = -1;
    let gap = 0;
    let groups = 0;
    while (end < text.length) {
      const c = text.charAt(end);
      if (isDigit(c)) {
        if (lastDigit !== end - 1) groups += 1;
        digits += 1;
        lastDigit = end;
        gap = 0;
      } else if ((PHONE_SEPARATORS.has(c) && gap < 2) || (c === '+' && end === i)) {
        // Written numbers have at most two separators in a row ("050 - 000"); more ends the number.
        gap += 1;
      } else {
        break;
      }
      end += 1;
    }
    // Phone numbers come in groups of digits ("050 000 0000"); single digits apart ("1 2 3 …") are a list.
    if (digits >= PHONE_MIN_DIGITS && digits >= 2 * groups) {
      out += CONTACT_REMOVED;
      masked = true;
      i = lastDigit + 1;
    } else {
      out += text.slice(i, Math.max(end, i + 1));
      i = Math.max(end, i + 1);
    }
  }
  return { text: out, masked };
}

/** Removes emails, messenger links and phone numbers from a message. */
export function maskContactDetails(text: string): { readonly text: string; readonly masked: boolean } {
  // Split on whitespace but keep it, so line breaks survive.
  const parts = text.split(/(\s+)/);
  const cleaned = parts.map((part) => {
    if (!isContactWord(part)) return part;
    const trail = /[.,;:!?)]$/.test(part) ? part.slice(-1) : '';
    return CONTACT_REMOVED + trail;
  });
  const wordsMasked = cleaned.some((part, i) => part !== parts[i]);
  const phones = maskPhones(cleaned.join(''));
  return { text: phones.text, masked: wordsMasked || phones.masked };
}

/**
 * How the author of a message is shown. Residents are "Owner" or "Tenant", never by name; a partner's people
 * appear under the company name; JAD+ staff as "JAD+".
 */
export function messageAuthorLabel(role: UserRole, partnerName: string | null): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'tenant':
      return 'Tenant';
    case 'partner':
    case 'partner_admin':
      return partnerName ?? 'Service partner';
    case 'jad_admin':
    case 'jad_viewer':
      return 'JAD+';
  }
}
