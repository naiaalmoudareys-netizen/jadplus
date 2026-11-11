/**
 * A D1Database stand-in backed by node:sqlite, so API tests run the real SQL against the real migrations.
 * Implements the subset JAD+ uses: prepare/bind/first/all/run and transactional batch. Like D1, BLOB columns
 * come back as plain number arrays, which exercises the API's toBytes() conversion. Like D1 (and unlike
 * node:sqlite, which quietly binds NULL to a missing value), a statement run with a different number of bound
 * values than its placeholders need is refused.
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

type Param = string | number | bigint | null | Uint8Array | ArrayBuffer;

function toInput(p: Param): SQLInputValue {
  if (p instanceof ArrayBuffer) return new Uint8Array(p);
  return p;
}

function fromOutput(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Uint8Array ? Array.from(v) : v;
  return out;
}

/**
 * How many values real D1 needs for `sql`: SQLite numbers an anonymous `?` one past the highest number so far
 * and `?N` as N, and asks for the highest. Placeholders inside string literals, quoted names and comments are
 * not placeholders.
 */
export function placeholderCount(sql: string): number {
  let highest = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = sql.indexOf(ch, i + 1);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '[') {
      const end = sql.indexOf(']', i + 1);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (ch === '?') {
      const digits = /^\d+/.exec(sql.slice(i + 1))?.[0] ?? '';
      highest = digits === '' ? highest + 1 : Math.max(highest, Number(digits));
      i += 1 + digits.length;
    } else {
      i += 1;
    }
  }
  return highest;
}

/** Like D1, a failing query rejects its promise rather than throwing where it is called. */
function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: readonly Param[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    for (const p of params) {
      if (p === undefined) throw new TypeError('D1_TYPE_ERROR: undefined cannot be bound');
    }
    return new Statement(this.db, this.sql, params as Param[]);
  }

  private inputs(): SQLInputValue[] {
    const wanted = placeholderCount(this.sql);
    if (wanted !== this.params.length) {
      throw new Error(
        `D1_ERROR: Wrong number of parameter bindings for SQL query. (expected ${wanted}, got ${this.params.length})`,
      );
    }
    return this.params.map(toInput);
  }

  first<T>(column?: string): Promise<T | null> {
    return settle(() => {
      const row = this.db.prepare(this.sql).get(...this.inputs()) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      const mapped = fromOutput(row);
      return (column === undefined ? mapped : mapped[column]) as T;
    });
  }

  all(): Promise<{ results: Record<string, unknown>[]; success: true; meta: Record<string, number> }> {
    return settle(() => {
      const rows = this.db.prepare(this.sql).all(...this.inputs()) as Record<string, unknown>[];
      return { results: rows.map(fromOutput), success: true as const, meta: { changes: 0 } };
    });
  }

  runSync(): { results: never[]; success: true; meta: { changes: number; last_row_id: number } } {
    const r = this.db.prepare(this.sql).run(...this.inputs());
    return {
      results: [],
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    };
  }

  run(): Promise<ReturnType<Statement['runSync']>> {
    return settle(() => this.runSync());
  }
}

export function d1(db: DatabaseSync): D1Database {
  const fake = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => s.runSync());
        db.exec('COMMIT');
        return Promise.resolve(results);
      } catch (err) {
        db.exec('ROLLBACK');
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
  // The fake implements only the D1 methods JAD+ calls; a missing one fails loudly in tests.
  return fake as unknown as D1Database;
}
