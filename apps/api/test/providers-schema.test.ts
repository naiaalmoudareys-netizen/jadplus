/**
 * Migration 0027 (ADR 0030): service flows, provider kinds and the "handled by JAD+" staff note mirror
 * packages/shared, and rebuilding request_notes keeps every note and its append-only protection (C-AUD-1).
 */
import { NOTE_KINDS, PROVIDER_KINDS, SERVICE_FLOWS } from '@jadplus/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BYTES32, NOW, insert, migratedDb, migrationFiles, requestRow, seedWorld } from './db.js';

const DIR = join(import.meta.dirname, '..', 'migrations');

describe('migration 0027 mirrors packages/shared (no drift)', () => {
  it('ADR 0030: every provider kind is accepted, and nothing else; existing partners are external', () => {
    const db = migratedDb();
    seedWorld(db);
    expect(db.prepare("SELECT kind FROM partners WHERE id = 'p-1'").get()).toEqual({ kind: 'external' });
    PROVIDER_KINDS.forEach((kind, i) => {
      insert(db, 'partners', {
        id: `p-k${String(i)}`,
        name: 'Fictional Team',
        kind,
        created_at: NOW,
        updated_at: NOW,
      });
    });
    expect(() => {
      insert(db, 'partners', { id: 'p-x', name: 'X', kind: 'franchise', created_at: NOW, updated_at: NOW });
    }).toThrow(/CHECK/);
  });

  it('ADR 0030: every service flow is accepted, and nothing else', () => {
    const db = migratedDb();
    for (const flow of SERVICE_FLOWS) {
      db.prepare("UPDATE services SET flow = ? WHERE code = 'education'").run(flow);
    }
    expect(() => db.prepare("UPDATE services SET flow = 'webinar' WHERE code = 'education'").run()).toThrow(
      /CHECK/,
    );
  });

  it('every staff note kind is accepted, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    insert(db, 'requests', requestRow());
    const note = (id: string, kind: string) => {
      insert(db, 'request_notes', {
        id,
        request_id: 'req-1',
        author_user_id: 'u-admin',
        kind,
        body_enc: BYTES32,
        at: NOW,
      });
    };
    NOTE_KINDS.forEach((kind, i) => {
      note(`n-${String(i)}`, kind);
    });
    expect(() => {
      note('n-x', 'gossip');
    }).toThrow(/CHECK/);
  });
});

describe('migration 0027 on a database with data', () => {
  it('C-AUD-1: rebuilding request_notes keeps every note, and notes stay append-only', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    const files = migrationFiles();
    const before = files.filter((f) => f < '0027');
    for (const f of before) db.exec(readFileSync(join(DIR, f), 'utf8'));
    seedWorld(db);
    insert(db, 'requests', requestRow());
    insert(db, 'request_notes', {
      id: 'n-1',
      request_id: 'req-1',
      author_user_id: 'u-admin',
      kind: 'owner_called',
      body_enc: BYTES32,
      at: NOW,
    });
    for (const f of files.filter((x) => x >= '0027')) db.exec(readFileSync(join(DIR, f), 'utf8'));
    expect(db.prepare('SELECT id, kind, at FROM request_notes').all()).toEqual([
      { id: 'n-1', kind: 'owner_called', at: NOW },
    ]);
    expect(() => db.prepare("UPDATE request_notes SET kind = 'note'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM request_notes').run()).toThrow(/append-only/);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
