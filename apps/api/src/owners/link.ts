/**
 * Keeps a JAD+ user in step with Salesforce as an owner (C-AUTH-3, U3, T2).
 *
 * - Salesforce says "owner": the person gets (or keeps) the owner role and their unit list is replaced.
 *   A new person is created from the Salesforce details (name, email, mobile; encrypted, C-PD-2).
 * - Salesforce says "not an owner" (sold, cancelled, shared email): the owner role ends, so every owner
 *   session ends with it (sessions are bound to a live grant), and the unit list is emptied.
 * - Salesforce cannot be reached: nothing changes and the stored list is used (T2).
 */
import { ownerAccess, type OwnerLookup, type SignInIdentifier } from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { blindIndex, encryptField, newId, type Keys } from '../crypto.js';

type Person = NonNullable<OwnerLookup['person']>;

export interface LinkInput {
  readonly db: D1Database;
  readonly keys: Keys;
  readonly now: number;
  readonly ipHash: Uint8Array | null;
  readonly requestId: string | null;
}

export type LinkResult =
  | { readonly kind: 'linked'; readonly userId: string }
  | { readonly kind: 'not_owner'; readonly userId: string | null }
  /** The Salesforce person matches more than one JAD+ user: a person must sort it out (U2). */
  | { readonly kind: 'conflict' }
  /** The person's JAD+ account was closed; it is not reopened automatically. */
  | { readonly kind: 'closed' };

async function hashes(keys: Keys, person: Person, who: SignInIdentifier | null) {
  const email = person.email ?? (who?.kind === 'email' ? who.value : null);
  const phone = who?.kind === 'phone' ? who.value : null;
  return {
    email,
    phone,
    emailHash: email === null ? null : await blindIndex(keys, 'email', email),
    phoneHash: phone === null ? null : await blindIndex(keys, 'phone', phone),
  };
}

/** The JAD+ users this Salesforce person already is (by contact id, email or mobile). */
async function matchingUsers(
  db: D1Database,
  contactId: string,
  emailHash: Uint8Array | null,
  phoneHash: Uint8Array | null,
): Promise<{ id: string; status: string }[]> {
  const rows = await db
    .prepare('SELECT id, status FROM users WHERE sf_contact_id = ? OR email_hash = ? OR phone_hash = ?')
    .bind(contactId, emailHash, phoneHash)
    .all<{ id: string; status: string }>();
  return rows.results;
}

function unitStatements(db: D1Database, userId: string, units: OwnerLookup['units'], now: number) {
  return [
    db.prepare('DELETE FROM owner_units WHERE user_id = ?').bind(userId),
    ...units.map((u) =>
      db
        .prepare(
          `INSERT INTO owner_units
             (user_id, sf_unit_id, sf_deal_id, unit_name, project, building, address, deal_role, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, sf_unit_id) DO NOTHING`,
        )
        .bind(userId, u.unitId, u.dealId, u.unitName, u.project, u.building, u.address, u.role, now),
    ),
    db
      .prepare('UPDATE users SET owner_synced_at = ?, updated_at = MAX(updated_at, ?) WHERE id = ?')
      .bind(now, now, userId),
  ];
}

/**
 * Applies a Salesforce answer to JAD+. `knownUserId` is the user the caller already identified (by the
 * verified email or number), if any; `who` is that verified identifier, if the person is signing in.
 */
export async function applyOwnerLookup(
  input: LinkInput,
  lookup: OwnerLookup,
  knownUserId: string | null,
  who: SignInIdentifier | null,
): Promise<LinkResult> {
  const { db, keys, now } = input;
  const access = ownerAccess(lookup);
  const audit = (
    action: 'owner_linked' | 'owner_access_removed',
    userId: string,
    detail: Readonly<Record<string, string | number | boolean>>,
  ) =>
    auditStatement(db, {
      at: now,
      actorUserId: null,
      actorRole: 'system',
      action,
      targetType: 'user',
      targetId: userId,
      ipHash: input.ipHash,
      httpRequestId: input.requestId,
      detail,
    });

  if (!access.allowed) {
    if (knownUserId === null) return { kind: 'not_owner', userId: null };
    const wasOwner = await db
      .prepare("SELECT 1 AS yes FROM user_roles WHERE user_id = ? AND role = 'owner' AND revoked_at IS NULL")
      .bind(knownUserId)
      .first();
    // Never an owner here: nothing to take away.
    if (wasOwner === null) return { kind: 'not_owner', userId: knownUserId };
    await db.batch([
      db
        .prepare(
          "UPDATE user_roles SET revoked_at = ? WHERE user_id = ? AND role = 'owner' AND revoked_at IS NULL",
        )
        .bind(now, knownUserId),
      ...unitStatements(db, knownUserId, [], now),
      audit('owner_access_removed', knownUserId, { reason: access.reason }),
    ]);
    return { kind: 'not_owner', userId: knownUserId };
  }

  const { person, units } = access;
  const h = await hashes(keys, person, who);
  const found = await matchingUsers(db, person.contactId, h.emailHash, h.phoneHash);
  if (found.some((u) => u.status === 'closed')) return { kind: 'closed' };
  const matches = new Set(found.map((u) => u.id));
  if (knownUserId !== null) matches.add(knownUserId);
  if (matches.size > 1) return { kind: 'conflict' };
  const [existing] = [...matches];
  const userId = existing ?? newId();

  const enc = (value: string, column: string) => encryptField(keys, value, `users.${column}:${userId}`);
  const emailEnc = h.email === null ? null : await enc(h.email, 'email');
  const phoneEnc = h.phone === null ? null : await enc(h.phone, 'phone');
  const personStatement =
    existing === undefined
      ? db
          .prepare(
            `INSERT INTO users (id, sf_contact_id, email_hash, email_enc, phone_hash, phone_enc, name_enc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            userId,
            person.contactId,
            h.emailHash,
            emailEnc,
            h.phoneHash,
            phoneEnc,
            await enc(person.name, 'name'),
            now,
            now,
          )
      : // An existing person keeps the email/number they already have; missing ones and the name are filled in.
        db
          .prepare(
            `UPDATE users SET sf_contact_id = ?, name_enc = ?, updated_at = MAX(updated_at, ?),
             email_enc = CASE WHEN email_hash IS NULL THEN ? ELSE email_enc END,
             email_hash = COALESCE(email_hash, ?),
             phone_enc = CASE WHEN phone_hash IS NULL THEN ? ELSE phone_enc END,
             phone_hash = COALESCE(phone_hash, ?)
           WHERE id = ?`,
          )
          .bind(
            person.contactId,
            await enc(person.name, 'name'),
            now,
            emailEnc,
            h.emailHash,
            phoneEnc,
            h.phoneHash,
            userId,
          );

  await db.batch([
    personStatement,
    db
      .prepare(
        `INSERT INTO user_roles (id, user_id, role, granted_at)
         SELECT ?, ?, 'owner', ? WHERE NOT EXISTS
           (SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'owner' AND revoked_at IS NULL)`,
      )
      .bind(newId(), userId, now, userId),
    ...unitStatements(db, userId, units, now),
    audit('owner_linked', userId, { units: units.length, created: existing === undefined }),
  ]);
  return { kind: 'linked', userId };
}
