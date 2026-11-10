/** Document rows and desk statuses (ADR 0011). */
import type { OwnerPortalAnswer } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { deskStatusLabel, documentRow } from '../src/portal/deskRows.js';

type DeskRequest = OwnerPortalAnswer['deskRequests'][number];

const req = (over: Partial<DeskRequest>): DeskRequest => ({
  id: 'r1',
  ref: 'JR-00041',
  type: 'SPA',
  status: 'New',
  dealId: 'DEMODEAL0000000001',
  unitName: '1204-J188',
  reply: null,
  createdAt: '2026-11-10T08:00:00Z',
  fileIds: [],
  ...over,
});

describe('document rows', () => {
  it('ADR 0011: never asked shows Request; asked shows its status; done with a file shows Open', () => {
    expect(documentRow(null)).toEqual({ note: null, action: { kind: 'request' } });
    expect(documentRow(req({}))).toEqual({ note: 'Requested', action: null });
    expect(documentRow(req({ status: 'In progress' }))).toEqual({ note: 'In progress', action: null });
    expect(documentRow(req({ status: 'Completed', fileIds: ['068000000000001AAA'] }))).toEqual({
      note: 'Ready',
      action: { kind: 'open', fileId: '068000000000001AAA' },
    });
    expect(documentRow(req({ status: 'Completed' })).action).toEqual({ kind: 'request' });
    expect(documentRow(req({ status: 'Cancelled' })).action).toEqual({ kind: 'request' });
  });

  it('statuses read plainly', () => {
    expect(deskStatusLabel('New')).toBe('Received');
    expect(deskStatusLabel('In progress')).toBe('In progress');
  });
});
