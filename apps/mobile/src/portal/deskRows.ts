/**
 * What a document row shows (Naya, 10-Nov-2026: SPA, Reservation Form and the others are listed under
 * Documents with "Request"). Never requested (or cancelled): REQUEST. Asked for: its status. Done with the
 * document attached: OPEN. Done without a file (e.g. sent another way): REQUEST again is offered.
 */
import type { OwnerPortalAnswer } from '@jadplus/shared';
import type { MessageKey } from '../i18n/dictionary.js';
import type { Translate } from '../i18n/lang.js';

type DeskRequest = OwnerPortalAnswer['deskRequests'][number];

export interface DocumentRow {
  /** Shown under the amount column: the request's state, or null. */
  readonly note: string | null;
  readonly action: { readonly kind: 'request' } | { readonly kind: 'open'; readonly fileId: string } | null;
}

export function documentRow(request: DeskRequest | null, t: Translate): DocumentRow {
  if (request === null) return { note: null, action: { kind: 'request' } };
  switch (request.status) {
    case 'New':
      return { note: t('desk.requested'), action: null };
    case 'In progress':
      return { note: t('desk.status.inProgress'), action: null };
    case 'Completed': {
      const [fileId] = request.fileIds;
      return fileId === undefined
        ? { note: t('desk.status.completed'), action: { kind: 'request' } }
        : { note: t('desk.ready'), action: { kind: 'open', fileId } };
    }
    case 'Cancelled':
      return { note: null, action: { kind: 'request' } };
  }
}

const STATUS_KEYS: Readonly<Record<DeskRequest['status'], MessageKey>> = {
  New: 'desk.status.new',
  'In progress': 'desk.status.inProgress',
  Completed: 'desk.status.completed',
  Cancelled: 'desk.status.cancelled',
};

/** Plain status for the list of desk requests ("Received" for New). */
export function deskStatusLabel(status: DeskRequest['status'], t: Translate): string {
  return t(STATUS_KEYS[status]);
}
