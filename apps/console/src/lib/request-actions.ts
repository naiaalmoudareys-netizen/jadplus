/**
 * What JAD+ Admin may do on a request now (ADR 0025, 0030): move it to another partner (E6, S6), reclassify an
 * open emergency as routine (E13), cancel it, or mark an old in-house request nobody could take as handled by
 * JAD+. The same rules as the API (packages/shared lifecycle and providers), so the page only offers what the API
 * would accept.
 */
import { OPEN_STATUSES, canMarkHandledByJad, canTransition, type Status } from '@jadplus/shared';

export interface AdminRequestActions {
  readonly reassign: boolean;
  readonly reclassify: boolean;
  readonly cancel: boolean;
  readonly handled: boolean;
}

export function adminRequestActions(
  status: Status,
  emergency: boolean,
  hasProvider: boolean,
): AdminRequestActions {
  return {
    reassign: canTransition('jad_admin', status, 'assigned'),
    reclassify: emergency && OPEN_STATUSES.has(status),
    cancel: canTransition('jad_admin', status, 'cancelled'),
    // The page knows the provider by name only; no name means no provider.
    handled: canMarkHandledByJad({ status, partnerId: hasProvider ? 'any' : null, emergency }),
  };
}
