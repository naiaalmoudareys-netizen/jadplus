/**
 * Turns the demo company's database into SQL for the developer's LOCAL D1: a reset file that empties every app
 * table (the append-only guards are lifted for the reset and put back exactly as the migrations wrote them), and
 * a data file with one INSERT per row, parents before children. Sign-in codes, throttles and sessions are left
 * out: people sign in afresh on the developer's machine.
 *
 * Two tables point at each other (a visit's "no access" photo, a photo's visit). Such a link is written as NULL
 * first and filled in by an UPDATE once both rows exist, and cleared before the reset deletes anything.
 */
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { toHex } from '../../src/crypto.js';

/** Bookkeeping tables of SQLite, D1 and wrangler, and short-lived sign-in state, never exported. */
const SKIPPED = new Set([
  'd1_migrations',
  'sqlite_sequence',
  'sign_in_codes',
  'sign_in_throttle',
  'sessions',
]);

interface Order {
  /** Tables, each after the tables its foreign keys point at. */
  readonly tables: string[];
  /** Columns written later because they point at a table placed after theirs: table to columns. */
  readonly later: Map<string, string[]>;
}

function tables(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name).filter((name) => !SKIPPED.has(name) && !name.startsWith('_cf_'));
}

export function parentFirst(db: DatabaseSync): Order {
  const names = tables(db);
  const fks = new Map<string, { table: string; from: string }[]>();
  for (const name of names) {
    const list = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { table: string; from: string }[];
    fks.set(
      name,
      list.filter((f) => f.table !== name && names.includes(f.table)),
    );
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  const later = new Map<string, string[]>();
  const waitingOn = (n: string) => (fks.get(n) ?? []).filter((f) => !placed.has(f.table));
  while (ordered.length < names.length) {
    let ready = names.filter((n) => !placed.has(n) && waitingOn(n).length === 0);
    if (ready.length === 0) {
      // A cycle: place the table waiting on the fewest others, its links to them filled in afterwards.
      const stuck = names
        .filter((n) => !placed.has(n))
        .sort((a, b) => waitingOn(a).length - waitingOn(b).length);
      const first = stuck[0];
      if (first === undefined) break;
      later.set(
        first,
        waitingOn(first).map((f) => f.from),
      );
      ready = [first];
    }
    for (const n of ready) {
      ordered.push(n);
      placed.add(n);
    }
  }
  return { tables: ordered, later };
}

function literal(value: SQLOutputValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  return `X'${toHex(value)}'`;
}

function primaryKey(db: DatabaseSync, table: string): string[] {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number }[];
  return cols
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
}

/** One INSERT per row, tables parent-first; links inside a cycle follow as UPDATEs. */
export function dataSql(db: DatabaseSync): string {
  const { tables: ordered, later } = parentFirst(db);
  const lines: string[] = [];
  const updates: string[] = [];
  for (const table of ordered) {
    const deferred = later.get(table) ?? [];
    const key = primaryKey(db, table);
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((c) => (deferred.includes(c) ? 'NULL' : literal(row[c] ?? null)));
      lines.push(
        `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`,
      );
      const set = deferred.filter((c) => row[c] !== null).map((c) => `"${c}" = ${literal(row[c] ?? null)}`);
      if (set.length > 0 && key.length > 0) {
        const where = key.map((k) => `"${k}" = ${literal(row[k] ?? null)}`).join(' AND ');
        updates.push(`UPDATE "${table}" SET ${set.join(', ')} WHERE ${where};`);
      }
    }
  }
  return `${[...lines, ...updates].join('\n')}\n`;
}

/**
 * Empties every app table, children first. Triggers that refuse deletes (audit log, events, messages...) are
 * dropped for the reset and created again from the exact SQL the migrations used.
 */
export function resetSql(db: DatabaseSync): string {
  const { tables: ordered, later } = parentFirst(db);
  const triggers = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all() as { name: string; sql: string }[];
  const guards = triggers.filter((t) => /BEFORE\s+DELETE/i.test(t.sql));
  return [
    ...guards.map((t) => `DROP TRIGGER IF EXISTS "${t.name}";`),
    'DELETE FROM sessions;',
    'DELETE FROM sign_in_codes;',
    'DELETE FROM sign_in_throttle;',
    ...[...later].flatMap(([table, cols]) =>
      cols.map((c) => `UPDATE "${table}" SET "${c}" = NULL WHERE "${c}" IS NOT NULL;`),
    ),
    ...[...ordered].reverse().map((t) => `DELETE FROM "${t}";`),
    ...guards.map((t) => `${t.sql.trim()};`),
    '',
  ].join('\n');
}
