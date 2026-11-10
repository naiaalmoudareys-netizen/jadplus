/**
 * Runs the real app against a fresh migrated database, with a controllable clock, a captured outbox
 * instead of email, and captured log lines (so tests can prove nothing sensitive is logged).
 */
import type { OwnerLookup, SignInIdentifier, UserRole } from '@jadplus/shared';
import { createApp } from '../src/app.js';
import { demoPortal, type OwnerPortalSource } from '../src/portal/source.js';
import { blindIndex, encryptField, importKeys, newId } from '../src/crypto.js';
import type { Bindings } from '../src/env.js';
import { d1 } from './d1.js';
import { NOW, SF_UNIT, migratedDb } from './db.js';

/** Fixed, obviously fake test keys (32 bytes each). Never used outside tests. */
export const TEST_INDEX_KEY = btoa('i'.repeat(32));
export const TEST_DATA_KEY = btoa('d'.repeat(32));

/** A private in-memory stand-in for R2 (put and get only, as the API uses them). */
function memoryBucket(): R2Bucket {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    put: (key: string, value: Uint8Array) => {
      objects.set(key, value);
      return Promise.resolve({ key });
    },
    get: (key: string) => {
      const value = objects.get(key);
      return Promise.resolve(value === undefined ? null : { body: new Blob([value]).stream() });
    },
  };
  return bucket as unknown as R2Bucket;
}

export const NOT_OWNER: OwnerLookup = { found: false, shared: false, person: null, units: [] };

let contacts = 0;

/** A fictional Salesforce buyer of the given units (default: the test unit). */
export function ownerRecord(email: string | null, unitIds: readonly string[] = [SF_UNIT]): OwnerLookup {
  contacts += 1;
  return {
    found: true,
    shared: false,
    person: {
      contactId: `003TEST${String(contacts).padStart(11, '0')}`,
      name: 'Layla Haddad',
      email,
      mobile: '+971 50 000 0000',
    },
    units: unitIds.map((unitId, i) => ({
      unitId,
      dealId: `006TEST${String(contacts * 100 + i).padStart(11, '0')}`,
      unitName: `JAD288-11${String(i).padStart(2, '0')}`,
      project: 'JAD 288',
      building: 'Building B',
      address: 'Jumeirah Village Circle, Dubai',
      role: 'Buyer' as const,
    })),
  };
}

export interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly env: Bindings;
  readonly sqlite: ReturnType<typeof migratedDb>;
  /** Codes "sent", with the email or number they went to. */
  readonly outbox: { to: string; code: string }[];
  readonly logs: string[];
  clock: number;
  /** Stand-in for Salesforce, keyed "email:<address>" or "phone:<+number>". Unknown people are not owners. */
  readonly salesforce: Map<string, OwnerLookup>;
  /** When true, Salesforce cannot be reached. */
  salesforceDown: boolean;
  /** Every identifier Salesforce was asked about, in order. */
  readonly salesforceCalls: string[];
  /** The owner-app data source (demo by default; tests can swap it). */
  portal: OwnerPortalSource;
  request(path: string, init?: RequestInit & { token?: string; json?: unknown }): Promise<Response>;
  addUser(opts: {
    email: string;
    roles: readonly (UserRole | readonly [UserRole, string])[];
  }): Promise<string>;
  /** Signs in by email (contains "@") or mobile number; returns the session token. */
  signIn(identifier: string, client?: 'mobile' | 'console'): Promise<string>;
}

export function harness(): Harness {
  const sqlite = migratedDb();
  const env: Bindings = {
    DB: d1(sqlite),
    MEDIA: memoryBucket(),
    ENVIRONMENT: 'local',
    INDEX_KEY: TEST_INDEX_KEY,
    DATA_KEY: TEST_DATA_KEY,
  };
  const outbox: { to: string; code: string }[] = [];
  const logs: string[] = [];
  const h: Harness = {
    sqlite,
    env,
    outbox,
    logs,
    clock: NOW,
    salesforce: new Map(),
    salesforceDown: false,
    salesforceCalls: [],
    portal: demoPortal,
    app: createApp({
      now: () => h.clock,
      sendSignInCode: (_env, to, code) => {
        outbox.push({ to: to.value, code });
        return Promise.resolve();
      },
      ownerDirectory: (_env, who: SignInIdentifier) => {
        const key = `${who.kind}:${who.value}`;
        h.salesforceCalls.push(key);
        if (h.salesforceDown) return Promise.reject(new Error('Salesforce unreachable (test)'));
        return Promise.resolve(h.salesforce.get(key) ?? NOT_OWNER);
      },
      ownerPortal: (env, email, now) => h.portal(env, email, now),
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
      // Owners exist because Salesforce says so (C-AUTH-3): register a fictional buyer with one unit.
      if (roles.includes('owner')) h.salesforce.set(`email:${email}`, ownerRecord(email));
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
    async signIn(identifier, client = 'mobile') {
      const field = identifier.includes('@') ? 'email' : 'phone';
      await h.request('/api/auth/code', { method: 'POST', json: { [field]: identifier } });
      const sent = outbox.at(-1);
      if (sent === undefined) throw new Error('no code was sent');
      const res = await h.request('/api/auth/verify', {
        method: 'POST',
        json: { [field]: identifier, code: sent.code, client },
      });
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
      return (await res.json<{ token: string }>()).token;
    },
  };
  return h;
}
