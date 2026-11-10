/**
 * Owners come from Salesforce (C-AUTH-3, U3, T2). An owner signs in with the email or mobile number on their
 * Salesforce buyer record; Salesforce decides which units they own (buyer or joint buyer on a Sold or Booked
 * deal). JAD+ keeps a copy of that unit list so emergencies keep working if Salesforce is down (T2).
 */
import { z } from 'zod';

const HOUR_MS = 3_600_000;

/** A stored unit list older than this is refreshed from Salesforce before it is relied on (U3). */
export const OWNER_UNITS_MAX_AGE_MS = 24 * HOUR_MS;

/**
 * A mobile number in international form (+ and 8-15 digits), or null if it cannot be one.
 * UAE numbers written locally ("050 000 0000", "50 000 0000") become +971. "00" means "+".
 */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[+\d\s().-]{7,25}$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (/^05\d{8}$/.test(digits)) {
    digits = `971${digits.slice(1)}`;
  } else if (/^5\d{8}$/.test(digits)) {
    digits = `971${digits}`;
  } else {
    return null;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/**
 * The last 9 digits of a number: how Salesforce matches phone numbers written in different ways
 * (same rule as the Phone_Match_Key formula in Salesforce).
 */
export function phoneMatchKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** How a person identifies themselves at sign-in. */
export type SignInIdentifier =
  { readonly kind: 'email'; readonly value: string } | { readonly kind: 'phone'; readonly value: string };

/** Salesforce record ids: 15 or 18 letters and digits. */
const sfId = z
  .string()
  .regex(/^[A-Za-z0-9]+$/)
  .refine((v) => v.length === 15 || v.length === 18);
const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * The answer of the Salesforce identity lookup (JADPlusIdentity, through the finance worker).
 * It comes from outside JAD+, so it is validated like any other input (C-VAL-1).
 */
export const ownerLookupResponse = z.strictObject({
  found: z.boolean(),
  /** The email or number belongs to more than one different person in Salesforce. */
  shared: z.boolean(),
  person: z
    .strictObject({
      contactId: sfId,
      name: text(200),
      email: z.string().trim().toLowerCase().max(254).pipe(z.email()).nullable(),
      mobile: z.string().max(40).nullable(),
    })
    .nullable(),
  units: z
    .array(
      z.strictObject({
        unitId: sfId,
        dealId: sfId,
        unitName: text(80),
        project: text(120).nullable(),
        /** Building name and project address: where a technician goes (ADR 0009). Not personal data. */
        building: text(80).nullable(),
        address: text(300).nullable(),
        role: z.enum(['Buyer', 'Joint buyer']),
      }),
    )
    .max(200),
});

export type OwnerLookup = z.infer<typeof ownerLookupResponse>;

export type OwnerAccess =
  | {
      readonly allowed: true;
      readonly person: NonNullable<OwnerLookup['person']>;
      readonly units: OwnerLookup['units'];
    }
  | { readonly allowed: false; readonly reason: 'not_owner' | 'shared' };

/**
 * C-AUTH-3: only one identifiable person with at least one Sold or Booked unit may sign in as an owner.
 * An email or number shared by two people (spouses, an agent) is refused, or one would see the other's units.
 */
export function ownerAccess(lookup: OwnerLookup): OwnerAccess {
  if (lookup.shared) return { allowed: false, reason: 'shared' };
  if (!lookup.found || lookup.person === null || lookup.units.length === 0) {
    return { allowed: false, reason: 'not_owner' };
  }
  return { allowed: true, person: lookup.person, units: lookup.units };
}

/** U3/T2: the stored unit list may be used as is, or must be refreshed from Salesforce first. */
export function ownerUnitsFresh(syncedAt: number, now: number): boolean {
  return now - syncedAt < OWNER_UNITS_MAX_AGE_MS;
}
