/**
 * What a document row shows (Naya, 10-Nov-2026: SPA, Reservation Form and the others are listed under
 * Documents with "Request"). Never requested (or cancelled): REQUEST. Asked for: its status. Done with the
 * document attached: OPEN. Done without a file (e.g. sent another way): REQUEST again is offered.
 */
import type { OwnerPortalAnswer } from '@jadplus/shared';

type DeskRequest = OwnerPortalAnswer['deskRequests'][number];

export interface DocumentRow {
  /** Shown under the amount column: the request's state, or null. */
  readonly note: string | null;
  readonly action: { readonly kind: 'request' } | { readonly kind: 'open'; readonly fileId: string } | null;
}

export function documentRow(request: DeskRequest | null): DocumentRow {
  if (request === null) return { note: null, action: { kind: 'request' } };
  switch (request.status) {
    case 'New':
      return { note: 'Requested', action: null };
    case 'In progress':
      return { note: 'In progress', action: null };
    case 'Completed': {
      const [fileId] = request.fileIds;
      return fileId === undefined
        ? { note: 'Completed', action: { kind: 'request' } }
        : { note: 'Ready', action: { kind: 'open', fileId } };
    }
    case 'Cancelled':
      return { note: null, action: { kind: 'request' } };
  }
}

/** Plain status for the list of desk requests. */
export function deskStatusLabel(status: DeskRequest['status']): string {
  return status === 'New' ? 'Received' : status;
}
