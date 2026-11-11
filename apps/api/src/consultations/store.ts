/**
 * Consultation records (ADR 0031, migration 0028): the owner's answers and consent, and the provider's steps.
 * Statements are returned unrun so callers batch them with the change they belong to.
 */
import type { ConsultationOutcome, RecordedStep } from '@jadplus/shared';
import { newId } from '../crypto.js';

export interface ConsultationRow {
  request_id: string;
  service_code: string;
  answers: string;
  consent_partner_id: string;
  consent_version: string;
  consented_at: number;
  /** The consented provider's name now. */
  provider_name: string;
}

export function readConsultation(db: D1Database, requestId: string): Promise<ConsultationRow | null> {
  return db
    .prepare(
      `SELECT c.request_id, c.service_code, c.answers, c.consent_partner_id, c.consent_version, c.consented_at,
              p.name AS provider_name
       FROM consultations c JOIN partners p ON p.id = c.consent_partner_id WHERE c.request_id = ?`,
    )
    .bind(requestId)
    .first<ConsultationRow>();
}

export async function readSteps(db: D1Database, requestId: string): Promise<RecordedStep[]> {
  const { results } = await db
    .prepare('SELECT step, note, at FROM consultation_steps WHERE request_id = ? ORDER BY at, rowid')
    .bind(requestId)
    .all<RecordedStep>();
  return results;
}

/** How the provider ended the consultation, if it has (jobflow.ts uses it for the owner's steps). */
export async function consultationOutcome(
  db: D1Database,
  requestId: string,
): Promise<ConsultationOutcome | null> {
  const row = await db
    .prepare(
      "SELECT step FROM consultation_steps WHERE request_id = ? AND step IN ('done', 'did_not_proceed') LIMIT 1",
    )
    .bind(requestId)
    .first<{ step: ConsultationOutcome }>();
  return row?.step ?? null;
}

export interface StepInput {
  readonly requestId: string;
  readonly step: string;
  readonly note: string | null;
  readonly partnerId: string;
  readonly actorUserId: string;
  readonly at: number;
}

export function stepStatement(db: D1Database, s: StepInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO consultation_steps (id, request_id, step, note, partner_id, actor_user_id, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), s.requestId, s.step, s.note, s.partnerId, s.actorUserId, s.at);
}
