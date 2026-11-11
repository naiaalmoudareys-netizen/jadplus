/**
 * Reading handover checklists (O2; ADR 0033) for the owner, the handover team and JAD+ Admin. Who sees which
 * checklist is decided by a fixed filter chosen by the route, never by the client (C-AZ-2):
 * - owner: the checklists of units on the owner's own Salesforce list (owner_units)
 * - office: the checklists whose handover request the signed-in company has
 * - admin: every checklist
 * Step notes are stored encrypted (C-PD-2) and decrypted here.
 */
import { orderedSteps, type HandoverChecklist, type HandoverStep, type VisitSlot } from '@jadplus/shared';
import { decryptField, encryptField, toBytes, type Keys } from '../crypto.js';

export type Viewer =
  | { readonly kind: 'owner'; readonly userId: string }
  | { readonly kind: 'office'; readonly partnerId: string }
  | { readonly kind: 'admin' };

/** SQL condition on `hc` (checklist) and `r` (its request) for a viewer, with its value. Fixed text only. */
function scope(viewer: Viewer): { readonly sql: string; readonly binds: readonly string[] } {
  if (viewer.kind === 'owner') {
    return {
      sql: 'EXISTS (SELECT 1 FROM owner_units o WHERE o.sf_unit_id = hc.sf_unit_id AND o.user_id = ?)',
      binds: [viewer.userId],
    };
  }
  if (viewer.kind === 'office') return { sql: 'r.partner_id = ?', binds: [viewer.partnerId] };
  return { sql: '1 = 1', binds: [] };
}

/** The unit's latest names from Salesforce (owner_units), as SQL joined on `key`. */
export const unitJoin = (key: string): string =>
  `LEFT JOIN owner_units ou ON ou.rowid =
     (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = ${key} ORDER BY x.synced_at DESC LIMIT 1)`;

interface ChecklistRow {
  id: string;
  request_id: string;
  ref: string;
  sf_unit_id: string;
  started_at: number;
  completed_at: number | null;
  key_date: string | null;
  key_slot: VisitSlot | null;
  updated_at: number;
  partner_id: string | null;
  partner_name: string | null;
  unit_name: string | null;
  project: string | null;
  building: string | null;
}

interface StepRow {
  checklist_id: string;
  step: HandoverStep;
  done_at: number | null;
  note_enc: Uint8Array | null;
}

export type StaffChecklist = HandoverChecklist & {
  readonly partnerName: string | null;
  readonly partnerId: string | null;
  readonly updatedAt: number;
};

const noteContext = (checklistId: string, step: HandoverStep): string =>
  `handover_steps.note:${checklistId}:${step}`;

export function encryptNote(
  keys: Keys,
  checklistId: string,
  step: HandoverStep,
  note: string,
): Promise<Uint8Array> {
  return encryptField(keys, note, noteContext(checklistId, step));
}

/** The checklists a viewer may see (newest first, completed last), or the one with `id`. */
export async function loadChecklists(
  db: D1Database,
  keys: Keys,
  viewer: Viewer,
  id: string | null = null,
): Promise<StaffChecklist[]> {
  const where = scope(viewer);
  const one = id === null ? '' : ' AND hc.id = ?';
  const binds = id === null ? where.binds : [...where.binds, id];
  const [lists, steps] = await Promise.all([
    db
      .prepare(
        `SELECT hc.id, hc.request_id, r.ref, hc.sf_unit_id, hc.started_at, hc.completed_at, hc.key_date, hc.key_slot,
           hc.updated_at, r.partner_id, p.name AS partner_name, ou.unit_name, ou.project, ou.building
         FROM handover_checklists hc
         JOIN requests r ON r.id = hc.request_id
         LEFT JOIN partners p ON p.id = r.partner_id
         ${unitJoin('hc.sf_unit_id')}
         WHERE ${where.sql}${one}
         ORDER BY hc.completed_at IS NOT NULL, hc.started_at DESC LIMIT 500`,
      )
      .bind(...binds)
      .all<ChecklistRow>(),
    db
      .prepare(
        `SELECT s.checklist_id, s.step, s.done_at, s.note_enc FROM handover_steps s
         JOIN handover_checklists hc ON hc.id = s.checklist_id
         JOIN requests r ON r.id = hc.request_id
         WHERE ${where.sql}${one}`,
      )
      .bind(...binds)
      .all<StepRow>(),
  ]);
  return Promise.all(
    lists.results.map(async (row) => {
      const own = steps.results.filter((s) => s.checklist_id === row.id);
      const shown = await Promise.all(
        own.map(async (s) => ({
          step: s.step,
          doneAt: s.done_at,
          note:
            s.note_enc === null
              ? null
              : await decryptField(keys, toBytes(s.note_enc), noteContext(row.id, s.step)),
        })),
      );
      return {
        id: row.id,
        requestId: row.request_id,
        requestRef: row.ref,
        unitName: row.unit_name,
        project: row.project,
        building: row.building,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        appointment:
          row.key_date === null || row.key_slot === null ? null : { date: row.key_date, slot: row.key_slot },
        steps: orderedSteps(shown),
        partnerName: row.partner_name,
        partnerId: row.partner_id,
        updatedAt: row.updated_at,
      };
    }),
  );
}

/** For an owner: the checklist without the staff-only fields. */
export function ownerView(c: StaffChecklist): HandoverChecklist {
  return {
    id: c.id,
    requestId: c.requestId,
    requestRef: c.requestRef,
    unitName: c.unitName,
    project: c.project,
    building: c.building,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    appointment: c.appointment,
    steps: c.steps,
  };
}

/**
 * The guarded "touch" every checklist change starts its batch with: updated_at moves on only if nobody changed the
 * checklist since it was read; otherwise it becomes 0, breaks the table's CHECK and the whole batch is rolled back.
 */
export function touchChecklist(
  db: D1Database,
  id: string,
  readAt: number,
  now: number,
  completedAt: number | null,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE handover_checklists SET updated_at = CASE WHEN updated_at = ? THEN ? ELSE 0 END, completed_at = ?
       WHERE id = ?`,
    )
    .bind(readAt, now, completedAt, id);
}

export function isChecklistConflict(err: unknown): boolean {
  return (
    err instanceof Error && /CHECK constraint failed/i.test(err.message) && /updated_at/i.test(err.message)
  );
}
