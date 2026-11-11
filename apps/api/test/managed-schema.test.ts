/**
 * Migration 0032 (ADR 0034) mirrors packages/shared: managed-unit sources and design project stages, and keeps
 * its history (arrangements are only ended, statements / delivery dates / stages are append-only).
 */
import { MANAGED_SOURCES, PROJECT_STAGES, VISIT_SLOT_KEYS } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { BYTES32, NOW, SF_UNIT, insert, migratedDb, requestRow, seedWorld } from './db.js';

function world() {
  const db = migratedDb();
  seedWorld(db);
  insert(db, 'requests', requestRow({ service_code: 'furnishing', partner_id: 'p-1', status: 'scheduled' }));
  return db;
}

const arrangement = (id: string, source: string, extra: Record<string, string | number | null> = {}) => ({
  id,
  sf_unit_id: SF_UNIT,
  owner_user_id: 'u-owner',
  provider_id: 'p-1',
  source,
  request_id: source === 'consultation' ? 'req-1' : null,
  since: '2026-11-01',
  until: null,
  set_at: NOW,
  set_by: 'u-admin',
  ended_at: NOW,
  ended_by: 'u-admin',
  ...extra,
});

describe('migration 0032 mirrors packages/shared (no drift)', () => {
  it('O4: every managed-unit source is accepted, and nothing else', () => {
    const db = world();
    MANAGED_SOURCES.forEach((source, i) => {
      insert(db, 'managed_units', arrangement(`m-${String(i)}`, source));
    });
    expect(() => {
      insert(db, 'managed_units', arrangement('m-x', 'gift'));
    }).toThrow(/CHECK/);
  });

  it('O5: every design stage and visit window is accepted, and nothing else', () => {
    const db = world();
    for (const stage of PROJECT_STAGES) {
      insert(db, 'project_stages', {
        id: `s-${stage}`,
        request_id: 'req-1',
        stage,
        partner_id: 'p-1',
        actor_user_id: 'u-tech',
        at: NOW,
      });
    }
    expect(() => {
      insert(db, 'project_stages', {
        id: 's-x',
        request_id: 'req-1',
        stage: 'party',
        partner_id: 'p-1',
        actor_user_id: 'u-tech',
        at: NOW,
      });
    }).toThrow(/CHECK/);
    for (const slot of VISIT_SLOT_KEYS) {
      insert(db, 'delivery_dates', {
        id: `d-${slot}`,
        request_id: 'req-1',
        delivery_date: '2026-11-20',
        slot,
        partner_id: 'p-1',
        set_by: 'u-tech',
        set_at: NOW,
      });
    }
    expect(() => {
      insert(db, 'delivery_dates', {
        id: 'd-x',
        request_id: 'req-1',
        delivery_date: '2026-11-20',
        slot: 'night',
        partner_id: 'p-1',
        set_by: 'u-tech',
        set_at: NOW,
      });
    }).toThrow(/CHECK/);
  });
});

describe('migration 0032 keeps history (C-AUD-1)', () => {
  it('O4: one open arrangement per unit; an arrangement can only be ended, never changed or deleted', () => {
    const db = world();
    insert(db, 'managed_units', arrangement('m-1', 'admin', { ended_at: null, ended_by: null }));
    expect(() => {
      insert(db, 'managed_units', arrangement('m-2', 'admin', { ended_at: null, ended_by: null }));
    }).toThrow(/UNIQUE/);
    expect(() =>
      db.prepare("UPDATE managed_units SET provider_id = 'p-1', until = '2027-01-01'").run(),
    ).toThrow(/history/);
    db.prepare("UPDATE managed_units SET ended_at = ?, ended_by = 'u-admin'").run(NOW);
    expect(() => db.prepare("UPDATE managed_units SET ended_by = 'u-owner'").run()).toThrow(/history/);
    expect(() => db.prepare('DELETE FROM managed_units').run()).toThrow(/history/);
    expect(() => {
      insert(db, 'managed_units', arrangement('m-3', 'consultation', { request_id: null }));
    }).toThrow(/CHECK/);
  });

  it('O4/O5: statements, delivery dates and stages are append-only', () => {
    const db = world();
    insert(db, 'managed_units', arrangement('m-1', 'admin'));
    insert(db, 'managed_statements', {
      id: 'st-1',
      managed_unit_id: 'm-1',
      month: '2026-11',
      r2_key: 'managed/m-1/statements/st-1.pdf',
      byte_size: 600,
      sha256: BYTES32,
      uploaded_by: 'u-admin',
      uploaded_at: NOW,
    });
    expect(() => {
      insert(db, 'managed_statements', {
        id: 'st-2',
        managed_unit_id: 'm-1',
        month: '2026-13',
        r2_key: 'k2',
        byte_size: 600,
        sha256: BYTES32,
        uploaded_by: 'u-admin',
        uploaded_at: NOW,
      });
    }).toThrow(/CHECK/);
    insert(db, 'delivery_dates', {
      id: 'd-1',
      request_id: 'req-1',
      delivery_date: '2026-11-20',
      slot: 'morning',
      partner_id: 'p-1',
      set_by: 'u-tech',
      set_at: NOW,
    });
    insert(db, 'project_stages', {
      id: 's-1',
      request_id: 'req-1',
      stage: 'concept',
      partner_id: 'p-1',
      actor_user_id: 'u-tech',
      at: NOW,
    });
    for (const table of ['managed_statements', 'delivery_dates', 'project_stages']) {
      expect(() => db.prepare(`UPDATE ${table} SET id = id`).run()).toThrow(/append-only/);
      expect(() => db.prepare(`DELETE FROM ${table}`).run()).toThrow(/append-only/);
    }
  });
});
