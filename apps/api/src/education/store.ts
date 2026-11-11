/** Shared reading for investor education (O5; ADR 0033): session rows and owners' names. */
import { providerKindFor, type EducationTimes, type SessionMode } from '@jadplus/shared';
import { decryptField, toBytes, type Keys } from '../crypto.js';

export interface SessionRow {
  id: string;
  title: string;
  description: string;
  starts_at: number;
  ends_at: number;
  mode: SessionMode;
  place: string;
  seats: number;
  created_at: number;
  cancelled_at: number | null;
  /** Seats held now (not given back). */
  taken: number;
}

export const SESSION_COLUMNS = `s.id, s.title, s.description, s.starts_at, s.ends_at, s.mode, s.place, s.seats,
  s.created_at, s.cancelled_at,
  (SELECT COUNT(*) FROM education_bookings b WHERE b.session_id = s.id AND b.cancelled_at IS NULL) AS taken`;

export async function sessionById(db: D1Database, id: string): Promise<SessionRow | null> {
  return db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM education_sessions s WHERE s.id = ?`)
    .bind(id)
    .first<SessionRow>();
}

export const timesOf = (s: SessionRow): EducationTimes => ({
  startsAt: s.starts_at,
  endsAt: s.ends_at,
  cancelledAt: s.cancelled_at,
});

/**
 * Whether this company is the education team: an active JAD Global team assigned (primary or backup) to the
 * education service now (ADR 0030 assignments).
 */
export async function isEducationTeam(db: D1Database, partnerId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
       WHERE sp.service_code = 'education' AND sp.ended_at IS NULL AND sp.partner_id = ?
         AND p.status = 'active' AND p.kind = ?`,
    )
    .bind(partnerId, providerKindFor('inhouse'))
    .first<{ ok: number }>();
  return row !== null;
}

/** An owner's name for staff lists (personal data: the route that shows it is audited). */
export function ownerName(keys: Keys, userId: string, nameEnc: Uint8Array | null): Promise<string | null> {
  return nameEnc === null
    ? Promise.resolve(null)
    : decryptField(keys, toBytes(nameEnc), `users.name:${userId}`);
}

/** A seat refused because the session filled up meanwhile (booked_at written as 0, migration 0030). */
export function isFullConflict(err: unknown): boolean {
  return (
    err instanceof Error && /CHECK constraint failed/i.test(err.message) && /booked_at/i.test(err.message)
  );
}

export function isUniqueConflict(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}
