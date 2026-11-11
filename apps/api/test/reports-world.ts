/**
 * A fictional world for Flow B (ADR 0032): the emergency world's owner and tenant, plus an outside snagging
 * inspector, a JAD Global handover team and a JAD Global valuation team, each with an office administrator and
 * a technician, and JAD+ staff. Fictional people only.
 */
import { DEFAULT_CALENDAR, dubaiDate, preferredDays } from '@jadplus/shared';
import { NOW, SF_UNIT } from './db.js';
import { world, type World } from './emergency-world.js';

export interface ReportWorld extends World {
  readonly inspectorOffice: string;
  readonly inspectorTech: string;
  readonly handoverOffice: string;
  readonly valuerOffice: string;
  readonly admin: string;
  readonly viewer: string;
}

const DAY = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '';

/** A minimal valid PDF ("%PDF-" first), padded to `size` bytes. */
export function pdf(size = 600): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-1.7\n% fictional test report\n'));
  return bytes;
}

export async function reportWorld(): Promise<ReportWorld> {
  const w = await world();
  const { h } = w;
  const db = h.sqlite;
  await h.addUser({ email: 'inspector.office@example.com', roles: [['partner_admin', 'p-inspector']] });
  const tech = await h.addUser({ email: 'inspector.tech@example.com', roles: [['partner', 'p-inspector']] });
  await h.addUser({ email: 'handover.office@example.com', roles: [['partner_admin', 'p-handover']] });
  await h.addUser({ email: 'valuer.office@example.com', roles: [['partner_admin', 'p-valuer']] });
  await h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  db.prepare("UPDATE partners SET name = 'Clear Sight Inspections (demo)' WHERE id = 'p-inspector'").run();
  db.prepare(
    "UPDATE partners SET name = 'Harbor Handover Team (demo)', kind = 'jad_group' WHERE id = 'p-handover'",
  ).run();
  db.prepare(
    "UPDATE partners SET name = 'Harbor Real Estate (demo)', kind = 'jad_group' WHERE id = 'p-valuer'",
  ).run();
  db.prepare('INSERT INTO technicians (id, partner_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(
    't-inspector',
    'p-inspector',
    tech,
    NOW,
  );
  const sp = db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, 'primary', ?)",
  );
  sp.run('sp-snag', 'snagging', 'p-inspector', NOW);
  sp.run('sp-handover', 'handover', 'p-handover', NOW);
  sp.run('sp-valuation', 'valuation', 'p-valuer', NOW);
  return {
    ...w,
    inspectorOffice: await h.signIn('inspector.office@example.com', 'console'),
    inspectorTech: await h.signIn('inspector.tech@example.com'),
    handoverOffice: await h.signIn('handover.office@example.com', 'console'),
    valuerOffice: await h.signIn('valuer.office@example.com', 'console'),
    admin: await h.signIn('demo@jadplus.ae', 'console'),
    viewer: await h.signIn('viewer@jadplus.ae', 'console'),
  };
}

export const post = (w: World, path: string, token: string, json: object = {}): Promise<Response> =>
  w.h.request(path, { method: 'POST', token, json });

export const upload = (
  w: World,
  path: string,
  token: string,
  body: Uint8Array<ArrayBuffer>,
  type: string,
): Promise<Response> => w.h.request(path, { method: 'POST', token, body, headers: { 'content-type': type } });

/** The owner raises a snagging (soft or professional) or valuation request; returns its id. */
export async function raiseReport(
  w: World,
  serviceCode: 'snagging' | 'valuation',
  snaggingType?: 'soft' | 'professional',
): Promise<string> {
  const res = await post(w, '/api/requests', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode,
    description: serviceCode === 'snagging' ? 'Pre-handover snagging please.' : 'Please value my unit.',
    preferredDate: DAY,
    preferredSlot: 'morning',
    ...(snaggingType === undefined ? {} : { snaggingType }),
  });
  if (res.status !== 201) throw new Error(`raise failed: ${String(res.status)} ${await res.text()}`);
  return (await res.json<{ requestId: string }>()).requestId;
}

/** The provider books the inspection (an hour from now) and starts it. */
export async function inspect(w: ReportWorld, id: string, office: string, techId: string): Promise<void> {
  const start = w.h.clock + 3_600_000;
  const book = await post(w, `/api/partner/jobs/${id}/visit`, office, {
    technicianId: techId,
    windowStart: start,
    windowEnd: start + 7_200_000,
  });
  if (book.status !== 200) throw new Error(`book failed: ${String(book.status)} ${await book.text()}`);
  const started = await post(w, `/api/partner/jobs/${id}/start`, office);
  if (started.status !== 200) throw new Error(`start failed: ${String(started.status)}`);
}
