/** Migration 0029 mirrors packages/shared (no drift): O3, C-AUD-1 (ADR 0032). */
import {
  REPORT_KINDS,
  REPORT_MAX_BYTES,
  REPORT_SERVICES,
  SNAGGING_TYPES,
  SNAG_EVENT_KINDS,
  SNAG_STATUSES,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, insert, migratedDb, seedWorld } from './db.js';

const HASH = new Uint8Array(32);

function world() {
  const db = migratedDb();
  seedWorld(db);
  let n = 0;
  const request = (): string => {
    n += 1;
    const id = `r-${String(n)}`;
    insert(db, 'requests', {
      id,
      ref: `JAD-T${String(n).padStart(4, '0')}`,
      service_code: 'snagging',
      sf_unit_id: 'a0X000000000001AAA',
      owner_user_id: 'u-owner',
      raised_by_user_id: 'u-owner',
      raised_by_role: 'owner',
      description: 'Snagging.',
      is_emergency: 0,
      status: 'in_progress',
      partner_id: 'p-1',
      created_at: NOW,
      updated_at: NOW,
      status_changed_at: NOW,
    });
    return id;
  };
  return { db, request };
}

describe('migration 0029 mirrors packages/shared (no drift)', () => {
  it('O3: report services and snagging types are exactly the shared lists', () => {
    const { db, request } = world();
    for (const service of REPORT_SERVICES) {
      const type = service === 'snagging' ? 'soft' : null;
      insert(db, 'report_requests', { request_id: request(), service, snagging_type: type, created_at: NOW });
    }
    for (const t of SNAGGING_TYPES) {
      insert(db, 'report_requests', {
        request_id: request(),
        service: 'snagging',
        snagging_type: t,
        created_at: NOW,
      });
    }
    expect(() => {
      insert(db, 'report_requests', {
        request_id: request(),
        service: 'leasing',
        snagging_type: null,
        created_at: NOW,
      });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'report_requests', {
        request_id: request(),
        service: 'snagging',
        snagging_type: 'deluxe',
        created_at: NOW,
      });
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'report_requests', {
        request_id: request(),
        service: 'valuation',
        snagging_type: 'soft',
        created_at: NOW,
      });
    }).toThrow(/CHECK/);
  });

  it('O3/C-AUD-1: every report kind is accepted, nothing else, 20 MB at most, append-only', () => {
    const { db, request } = world();
    const id = request();
    REPORT_KINDS.forEach((kind, i) => {
      insert(db, 'request_reports', {
        id: `rep-${String(i)}`,
        request_id: id,
        kind,
        r2_key: `requests/${id}/reports/${String(i)}.pdf`,
        byte_size: REPORT_MAX_BYTES,
        sha256: HASH,
        partner_id: 'p-1',
        uploaded_by_user_id: 'u-tech',
        uploaded_at: NOW,
      });
    });
    const bad = (over: Record<string, string | number>) => () => {
      insert(db, 'request_reports', {
        id: 'rep-x',
        request_id: request(),
        kind: 'snagging',
        r2_key: 'requests/x.pdf',
        byte_size: 1,
        sha256: HASH,
        partner_id: 'p-1',
        uploaded_by_user_id: 'u-tech',
        uploaded_at: NOW,
        ...over,
      });
    };
    expect(bad({ kind: 'quote' })).toThrow(/CHECK/);
    expect(bad({ byte_size: REPORT_MAX_BYTES + 1 })).toThrow(/CHECK/);
    expect(() =>
      db.prepare("UPDATE request_reports SET kind = 'valuation' WHERE id = 'rep-0'").run(),
    ).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM request_reports WHERE id = 'rep-0'").run()).toThrow(/append-only/);
  });

  it('O3/C-AUD-1: snag statuses and history kinds are exactly the shared lists; history is append-only', () => {
    const { db, request } = world();
    const id = request();
    SNAG_STATUSES.forEach((status, i) => {
      const fixed = status !== 'open';
      insert(db, 'snags', {
        id: `s-${String(i)}`,
        request_id: id,
        title: 'Cracked tile',
        room: 'Kitchen',
        status,
        ...(fixed
          ? {
              fix_photo_r2_key: `k-${String(i)}`,
              fix_photo_type: 'image/jpeg',
              fixed_at: NOW,
              fixed_by_partner_id: 'p-1',
            }
          : {}),
        created_by_user_id: 'u-tech',
        created_at: NOW,
        updated_at: NOW,
      });
    });
    expect(() => {
      insert(db, 'snags', {
        id: 's-x',
        request_id: id,
        title: 'X',
        room: 'Y',
        status: 'stale',
        created_by_user_id: 'u-tech',
        created_at: NOW,
        updated_at: NOW,
      });
    }).toThrow(/CHECK/);
    SNAG_EVENT_KINDS.forEach((kind, i) => {
      insert(db, 'snag_events', {
        id: `e-${String(i)}`,
        snag_id: 's-0',
        request_id: id,
        at: NOW,
        actor_user_id: 'u-tech',
        actor_role: 'partner',
        kind,
        ...(kind === 'photo_added' || kind === 'fixed' ? { photo_r2_key: 'k' } : {}),
      });
    });
    expect(() => db.prepare("UPDATE snag_events SET kind = 'added' WHERE id = 'e-1'").run()).toThrow(
      /append-only/,
    );
    expect(() => db.prepare("DELETE FROM snags WHERE id = 's-0'").run()).toThrow(/kept/);
  });
});
