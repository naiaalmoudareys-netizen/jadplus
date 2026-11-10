/**
 * A D1Database stand-in backed by node:sqlite, so API tests run the real SQL against the real migrations.
 * Implements the subset JAD+ uses: prepare/bind/first/all/run and transactional batch. Like D1, BLOB columns
 * come back as plain number arrays, which exercises the API's toBytes() conversion.
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
    return this.params.map(toInput);
  }

  first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.inputs()) as Record<string, unknown> | undefined;
    if (row === undefined) return Promise.resolve(null);
    const mapped = fromOutput(row);
    return Promise.resolve((column === undefined ? mapped : mapped[column]) as T);
  }

  all(): Promise<{ results: Record<string, unknown>[]; success: true; meta: Record<string, number> }> {
    const rows = this.db.prepare(this.sql).all(...this.inputs()) as Record<string, unknown>[];
    return Promise.resolve({ results: rows.map(fromOutput), success: true, meta: { changes: 0 } });
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
    return Promise.resolve(this.runSync());
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
