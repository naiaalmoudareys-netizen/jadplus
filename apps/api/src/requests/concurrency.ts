/**
 * Optimistic concurrency for requests. Two changes to the same request at once (a partner acknowledging
 * while the escalation job moves it to the backup) must not both win.
 *
 * Every update sets `version` with versionGuard: if the row still has the version the caller read, it goes
 * up by one; if someone changed the row in between, it becomes 0. 0 breaks the table's CHECK (version >= 1),
 * so that statement fails and D1 rolls back the WHOLE batch, including the history, outbox and audit rows.
 * A change and its evidence are therefore saved together or not at all.
 */
import { ApiError } from '../errors.js';

/** SQL fragment for an UPDATE's SET list; bind the version the caller read at its position. */
export const versionGuard = 'version = CASE WHEN version = ? THEN version + 1 ELSE 0 END';

export const CONFLICT_MESSAGE = 'This job was just changed by someone else. Refresh and try again.';

export function isVersionConflict(err: unknown): boolean {
  return err instanceof Error && /CHECK constraint failed/i.test(err.message) && /version/i.test(err.message);
}

/** Runs a batch; a version conflict becomes a 409 answer instead of an error. */
export async function withConflictCheck<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isVersionConflict(err)) throw new ApiError(409, CONFLICT_MESSAGE);
    throw err;
  }
}
