/**
 * What JAD+ Admin may do on a request now (ADR 0025): move it to another partner (E6, S6), reclassify an open
 * emergency as routine (E13), cancel it. The same transition rules as the API (packages/shared lifecycle), so
 * the page only offers what the API would accept.
 */
import { OPEN_STATUSES, canTransition, type Status } from '@jadplus/shared';

export interface AdminRequestActions {
  readonly reassign: boolean;
  readonly reclassify: boolean;
  readonly cancel: boolean;
}

export function adminRequestActions(status: Status, emergency: boolean): AdminRequestActions {
  return {
    reassign: canTransition('jad_admin', status, 'assigned'),
    reclassify: emergency && OPEN_STATUSES.has(status),
    cancel: canTransition('jad_admin', status, 'cancelled'),
  };
}
