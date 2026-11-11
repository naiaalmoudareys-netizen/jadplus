/**
 * Migration 0030 (ADR 0033) mirrors packages/shared: handover steps, session modes and book request statuses.
 */
import { BOOK_REQUEST_STATUSES, HANDOVER_STEPS, SESSION_MODES, VISIT_SLOT_KEYS } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT, insert, migratedDb, requestRow, seedWorld } from './db.js';

function world() {
  const db = migratedDb();
  seedWorld(db);
  insert(db, 'requests', requestRow({ service_code: 'handover' }));
  insert(db, 'handover_checklists', {
    id: 'h-1',
    request_id: 'req-1',
    sf_unit_id: SF_UNIT,
    started_at: NOW,
    started_by: 'u-admin',
    updated_at: NOW,
  });
  return db;
}

describe('migration 0030 mirrors packages/shared (no drift)', () => {
  it('O2: every handover step is accepted, and nothing else', () => {
    const db = world();
    for (const step of HANDOVER_STEPS) {
      insert(db, 'handover_steps', { checklist_id: 'h-1', step, updated_at: NOW });
    }
    expect(() => {
      insert(db, 'handover_steps', { checklist_id: 'h-1', step: 'party', updated_at: NOW });
    }).toThrow(/CHECK/);
  });

  it('O2: every visit window is a key collection window, and a date comes with its window', () => {
    const db = world();
    for (const slot of VISIT_SLOT_KEYS) {
      db.prepare("UPDATE handover_checklists SET key_date = '2026-11-12', key_slot = ?").run(slot);
    }
    expect(() => db.prepare("UPDATE handover_checklists SET key_slot = 'night'").run()).toThrow(/CHECK/);
    expect(() => db.prepare('UPDATE handover_checklists SET key_slot = NULL').run()).toThrow(/CHECK/);
    expect(() => db.prepare('UPDATE handover_checklists SET updated_at = 0').run()).toThrow(/updated_at/);
  });

  it('O5: every session mode and book status is accepted, and nothing else; a seat needs booked_at > 0', () => {
    const db = world();
    const add = (id: string, mode: string) => {
      insert(db, 'education_sessions', {
        id,
        title: 'Session',
        description: 'About investing.',
        starts_at: NOW + 1000,
        ends_at: NOW + 2000,
        mode,
        place: 'Office',
        seats: 10,
        created_at: NOW,
        created_by: 'u-admin',
        updated_at: NOW,
      });
    };
    SESSION_MODES.forEach((mode, i) => {
      add(`s-${String(i)}`, mode);
    });
    expect(() => {
      add('s-x', 'radio');
    }).toThrow(/CHECK/);
    expect(() => {
      insert(db, 'education_bookings', { id: 'b-0', session_id: 's-0', user_id: 'u-owner', booked_at: 0 });
    }).toThrow(/booked_at/);
    for (const status of BOOK_REQUEST_STATUSES) {
      const sent = status === 'sent';
      insert(db, 'education_book_requests', {
        id: `q-${status}`,
        user_id: sent ? 'u-owner' : 'u-tenant',
        requested_at: NOW,
        status,
        sent_at: sent ? NOW : null,
        sent_by: sent ? 'u-admin' : null,
      });
    }
    expect(() => {
      insert(db, 'education_book_requests', {
        id: 'q-x',
        user_id: 'u-tech',
        requested_at: NOW,
        status: 'lost',
      });
    }).toThrow(/CHECK/);
  });
});
