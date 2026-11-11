/** What the stories share: the world, the clock, the random source and who is who in the demo company. */
import { encryptField, blindIndex } from '../../src/crypto.js';
import type { Actor } from './actors.js';
import type { DemoOwner, DemoPerson, DemoUnit } from './people.js';
import type { Rng } from './rng.js';
import type { Sim } from './sim.js';
import type { CompanyWorld } from './world.js';

export interface Tech {
  /** technicians.id */
  readonly id: string;
  readonly actor: Actor;
}

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly office: Actor;
  readonly techs: Tech[];
}

export interface Tenancy {
  readonly id: string;
  readonly unit: DemoUnit;
  readonly tenant: Actor;
}

export interface Owner {
  readonly person: DemoOwner;
  readonly actor: Actor;
  /** Has agreed to a make-safe limit (E8), so a technician may make an emergency safe. */
  makeSafe: boolean;
  /** Units a tenant lives in (requests then go through the tenancy). */
  readonly tenancies: Tenancy[];
  /** Units managed by the property management team: unit id to the arrangement's id. */
  readonly managed: Map<string, string>;
  userId: string;
}

export interface Company {
  readonly w: CompanyWorld;
  readonly sim: Sim;
  readonly r: Rng;
  /** 1 for a full quarter; smaller for a short run (the maintenance test), so set-up waits shrink with it. */
  readonly scale: number;
  readonly admin: Actor;
  readonly ops: Actor;
  readonly viewer: Actor;
  /** Keyed: fixers, gulf, precision, casa, atelier, residency, crescent, pm, re. */
  readonly providers: Map<string, Provider>;
  readonly owners: Owner[];
  readonly tenantPeople: DemoPerson[];
  /** Ids of every request raised, for the summary. */
  readonly requests: string[];
}

export function provider(c: Company, key: string): Provider {
  const p = c.providers.get(key);
  if (p === undefined) throw new Error(`No provider ${key}`);
  return p;
}

export function tech(p: Provider, i = 0): Tech {
  const t = p.techs[i % p.techs.length];
  if (t === undefined) throw new Error(`${p.name} has no team`);
  return t;
}

/** Inserts a person exactly as the API stores one (blind index + encrypted email and name). */
export async function insertUser(
  w: CompanyWorld,
  id: string,
  email: string,
  name: string,
  at: number,
): Promise<void> {
  w.db
    .prepare(
      'INSERT INTO users (id, email_hash, email_enc, name_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      await blindIndex(w.keys, 'email', email),
      await encryptField(w.keys, email, `users.email:${id}`),
      await encryptField(w.keys, name, `users.name:${id}`),
      at,
      at,
    );
}

/** The provider holding a request now (it may have been moved to the backup or by JAD+). */
export function holder(c: Company, requestId: string): Provider {
  const row = c.w.db.prepare('SELECT partner_id FROM requests WHERE id = ?').get(requestId) as
    { partner_id: string | null } | undefined;
  const p = [...c.providers.values()].find((x) => x.id === row?.partner_id);
  if (p === undefined) throw new Error('The request has no provider');
  return p;
}

export function statusOf(c: Company, requestId: string): string {
  const row = c.w.db.prepare('SELECT status FROM requests WHERE id = ?').get(requestId) as
    { status: string } | undefined;
  return row?.status ?? 'missing';
}
