/**
 * The demo company's world: the real JAD+ app over a fresh, fully migrated in-memory database (the same node:sqlite
 * stand-in for D1 the API tests use), a clock the simulation moves, an in-memory file store whose objects are kept
 * for export, and "Salesforce" answering for the fictional owners only. Nothing leaves the process.
 */
import type { OwnerLookup, SignInIdentifier } from '@jadplus/shared';
import { createApp } from '../../src/app.js';
import { importKeys, type Keys } from '../../src/crypto.js';
import { demoPortal } from '../../src/portal/source.js';
import type { Bindings } from '../../src/env.js';
import { d1 } from '../../test/d1.js';
import { migratedDb } from '../../test/db.js';

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface CompanyWorld {
  readonly app: ReturnType<typeof createApp>;
  readonly env: Bindings;
  readonly db: ReturnType<typeof migratedDb>;
  readonly keys: Keys;
  readonly objects: Map<string, StoredObject>;
  /** Sign-in codes "sent", newest last. */
  readonly outbox: { to: string; code: string }[];
  /** Fictional Salesforce: "email:<address>" or "phone:<+number>" to the owner record. */
  readonly salesforce: Map<string, OwnerLookup>;
  clock: number;
}

/** An in-memory R2 that keeps every object (and its type) so the export can write them out. */
function keptBucket(objects: Map<string, StoredObject>): R2Bucket {
  const bucket = {
    put: (
      key: string,
      value: Uint8Array | ArrayBuffer,
      opts?: { httpMetadata?: { contentType?: string } },
    ) => {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(value);
      objects.set(key, { bytes, contentType: opts?.httpMetadata?.contentType ?? 'application/octet-stream' });
      return Promise.resolve({ key });
    },
    get: (key: string) => {
      const value = objects.get(key);
      return Promise.resolve(value === undefined ? null : { body: new Blob([value.bytes]).stream() });
    },
    delete: (key: string) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return bucket as unknown as R2Bucket;
}

const NOT_OWNER: OwnerLookup = { found: false, shared: false, person: null, units: [] };

export async function companyWorld(
  indexKey: string,
  dataKey: string,
  start: number,
  logSink: (line: string) => void = () => undefined,
): Promise<CompanyWorld> {
  const db = migratedDb();
  const objects = new Map<string, StoredObject>();
  const env: Bindings = {
    DB: d1(db),
    MEDIA: keptBucket(objects),
    ENVIRONMENT: 'local',
    INDEX_KEY: indexKey,
    DATA_KEY: dataKey,
  };
  const outbox: { to: string; code: string }[] = [];
  const salesforce = new Map<string, OwnerLookup>();
  const w: CompanyWorld = {
    db,
    env,
    keys: await importKeys(indexKey, dataKey),
    objects,
    outbox,
    salesforce,
    clock: start,
    app: createApp({
      now: () => w.clock,
      sendSignInCode: (_env, to, code) => {
        outbox.push({ to: to.value, code });
        return Promise.resolve();
      },
      ownerDirectory: (_env, who: SignInIdentifier) =>
        Promise.resolve(salesforce.get(`${who.kind}:${who.value}`) ?? NOT_OWNER),
      ownerPortal: (e, email, now) => demoPortal(e, email, now),
      // The app's logger redacts personal data; by default its lines are dropped.
      logSink,
    }),
  };
  return w;
}
