/**
 * Runs the real app against a fresh migrated database, with a controllable clock, a captured outbox
 * instead of email, and captured log lines (so tests can prove nothing sensitive is logged).
 */
import type { UserRole } from '@jadplus/shared';
import { createApp } from '../src/app.js';
import { blindIndex, encryptField, importKeys, newId } from '../src/crypto.js';
import type { Bindings } from '../src/env.js';
import { d1 } from './d1.js';
import { NOW, migratedDb } from './db.js';

/** Fixed, obviously fake test keys (32 bytes each). Never used outside tests. */
export const TEST_INDEX_KEY = btoa('i'.repeat(32));
export const TEST_DATA_KEY = btoa('d'.repeat(32));

export interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly env: Bindings;
  readonly sqlite: ReturnType<typeof migratedDb>;
  readonly outbox: { email: string; code: string }[];
  readonly logs: string[];
  clock: number;
  /** Stand-in for the Salesforce unit → owner lookup. */
  readonly unitOwners: Map<string, string>;
  request(path: string, init?: RequestInit & { token?: string; json?: unknown }): Promise<Response>;
  addUser(opts: {
    email: string;
    roles: readonly (UserRole | readonly [UserRole, string])[];
  }): Promise<string>;
  signIn(email: string, client?: 'mobile' | 'console'): Promise<string>;
}

export function harness(): Harness {
  const sqlite = migratedDb();
  const env: Bindings = {
    DB: d1(sqlite),
    MEDIA: {} as R2Bucket,
    ENVIRONMENT: 'local',
    INDEX_KEY: TEST_INDEX_KEY,
    DATA_KEY: TEST_DATA_KEY,
  };
  const outbox: { email: string; code: string }[] = [];
  const logs: string[] = [];
  const h: Harness = {
    sqlite,
    env,
    outbox,
    logs,
    clock: NOW,
    unitOwners: new Map(),
    app: createApp({
      now: () => h.clock,
      sendSignInCode: (_env, email, code) => {
        outbox.push({ email, code });
        return Promise.resolve();
      },
      unitOwner: (_env, sfUnitId) => Promise.resolve(h.unitOwners.get(sfUnitId) ?? null),
      logSink: (line) => logs.push(line),
    }),
    request(path, init = {}) {
      const { token: bearer, json, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
      if (json !== undefined) headers.set('content-type', 'application/json');
      const body = json === undefined ? rest.body : JSON.stringify(json);
      return Promise.resolve(h.app.request(path, { ...rest, headers, body: body ?? null }, env));
    },
    async addUser({ email, roles }) {
      const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
      const id = newId();
      sqlite
        .prepare(
          'INSERT INTO users (id, email_hash, email_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          id,
          await blindIndex(keys, 'email', email),
          await encryptField(keys, email, `users.email:${id}`),
          NOW,
          NOW,
        );
      for (const r of roles) {
        const [role, partnerId] = typeof r === 'string' ? [r, null] : r;
        if (partnerId !== null) {
          sqlite
            .prepare('INSERT OR IGNORE INTO partners (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .run(partnerId, 'Fictional Fixers LLC', NOW, NOW);
        }
        sqlite
          .prepare(
            'INSERT INTO user_roles (id, user_id, role, partner_id, granted_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(newId(), id, role, partnerId, NOW);
      }
      return id;
    },
    async signIn(email, client = 'mobile') {
      await h.request('/api/auth/code', { method: 'POST', json: { email } });
      const sent = outbox.at(-1);
      if (sent?.email !== email) throw new Error('no code was sent');
      const res = await h.request('/api/auth/verify', {
        method: 'POST',
        json: { email, code: sent.code, client },
      });
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
      return (await res.json<{ token: string }>()).token;
    },
  };
  return h;
}
