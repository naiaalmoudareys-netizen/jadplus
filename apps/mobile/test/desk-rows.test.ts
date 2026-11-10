/** Document rows and desk statuses (ADR 0011). */
import type { OwnerPortalAnswer } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { translator } from '../src/i18n/lang.js';
import { deskStatusLabel, documentRow } from '../src/portal/deskRows.js';

const en = translator('en');
const ru = translator('ru');

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
    expect(documentRow(null, en)).toEqual({ note: null, action: { kind: 'request' } });
    expect(documentRow(req({}), en)).toEqual({ note: 'Requested', action: null });
    expect(documentRow(req({ status: 'In progress' }), en)).toEqual({ note: 'In progress', action: null });
    expect(documentRow(req({ status: 'Completed', fileIds: ['068000000000001AAA'] }), en)).toEqual({
      note: 'Ready',
      action: { kind: 'open', fileId: '068000000000001AAA' },
    });
    expect(documentRow(req({ status: 'Completed' }), en).action).toEqual({ kind: 'request' });
    expect(documentRow(req({ status: 'Cancelled' }), en).action).toEqual({ kind: 'request' });
  });

  it('statuses read plainly', () => {
    expect(deskStatusLabel('New', en)).toBe('Received');
    expect(deskStatusLabel('In progress', en)).toBe('In progress');
  });

  it('ADR 0016: notes and statuses in the chosen language', () => {
    expect(documentRow(req({}), ru).note).toBe('Запрошено');
    expect(deskStatusLabel('New', ru)).toBe('Получено');
  });
});
