/**
 * Provider workspaces (ADR 0036): each office's console is exactly its work, and the API refuses every office
 * endpoint outside it (C-AZ-1: deny by default). O2, O3, O4, O5, P5, S4, C-AZ-2. Fictional companies only.
 */
import {
  CONSULTATION_CONSENT_VERSION,
  DEFAULT_CALENDAR,
  adminPartnersResponse,
  dubaiDate,
  partnerConsultationsResponse,
  partnerInspectionsResponse,
  partnerOverviewResponse,
  partnerWorkspaceResponse,
  preferredDays,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { leak, raise, world, type World } from './emergency-world.js';

interface Offices {
  readonly w: World;
  /** Harbor Property Management (demo): handover and property management, a JAD Global team. */
  readonly pm: string;
  /** Harbor Real Estate (demo): leasing, resale, valuation and education, a JAD Global team. */
  readonly re: string;
  /** Primary Fixers LLC: maintenance, an outside partner. */
  readonly fixers: string;
  readonly admin: string;
}

async function offices(): Promise<Offices> {
  const w = await world();
  const db = w.h.sqlite;
  const team = db.prepare(
    "INSERT INTO partners (id, name, kind, created_at, updated_at) VALUES (?, ?, 'jad_group', ?, ?)",
  );
  team.run('harbor-pm', 'Harbor Property Management (demo)', NOW, NOW);
  team.run('harbor-re', 'Harbor Real Estate (demo)', NOW, NOW);
  const sp = db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, 'primary', ?)",
  );
  for (const code of ['handover', 'property-management']) sp.run(`sp-${code}`, code, 'harbor-pm', NOW);
  for (const code of ['leasing', 'resale', 'valuation', 'education'])
    sp.run(`sp-${code}`, code, 'harbor-re', NOW);
  await w.h.addUser({ email: 'pm.office@example.com', roles: [['partner_admin', 'harbor-pm']] });
  await w.h.addUser({ email: 're.office@example.com', roles: [['partner_admin', 'harbor-re']] });
  await w.h.addUser({ email: 'fixers.office@example.com', roles: [['partner_admin', 'p-primary']] });
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  return {
    w,
    pm: await w.h.signIn('pm.office@example.com', 'console'),
    re: await w.h.signIn('re.office@example.com', 'console'),
    fixers: await w.h.signIn('fixers.office@example.com', 'console'),
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
  };
}

const status = async (o: Offices, path: string, token: string): Promise<number> =>
  (await o.w.h.request(path, { token })).status;

const workspace = async (o: Offices, token: string) =>
  partnerWorkspaceResponse.parse(await (await o.w.h.request('/api/partner/workspace', { token })).json());

const overview = async (o: Offices, token: string) =>
  partnerOverviewResponse.parse(await (await o.w.h.request('/api/partner/overview', { token })).json());

describe('workspaces (ADR 0036)', () => {
  it('each office learns its company, kind, title, services and exact pages', async () => {
    const o = await offices();
    const pm = await workspace(o, o.pm);
    expect(pm).toMatchObject({ name: 'Harbor Property Management (demo)', kind: 'jad_group' });
    expect(pm.workspace.title).toBe('Property management & handover');
    expect(pm.workspace.pages).toEqual([
      'overview',
      'dispatch',
      'jobs',
      'consultations',
      'inspections',
      'handovers',
      'snags',
      'messages',
      'managed_units',
      'team',
      'performance',
      'documents',
    ]);
    const re = await workspace(o, o.re);
    expect(re.workspace.title).toBe('Sales & leasing advisory');
    expect(re.workspace.pages).toEqual([
      'overview',
      'consultations',
      'inspections',
      'messages',
      'education',
      'team',
      'documents',
    ]);
    const fixers = await workspace(o, o.fixers);
    expect(fixers.workspace.title).toBe('Maintenance & home services');
    expect(fixers.workspace.pages).toContain('invoices');
    expect(fixers.workspace.pages).not.toContain('handovers');
    expect(await status(o, '/api/partner/workspace', o.w.primaryToken)).toBe(403);
    expect(await status(o, '/api/partner/workspace', o.admin)).toBe(403);
  });

  it('C-AZ-1: the sales & leasing office is refused every page outside its workspace', async () => {
    const o = await offices();
    for (const path of [
      '/api/partner/dispatch',
      '/api/partner/quotes',
      '/api/partner/after-hours',
      '/api/partner/handovers',
      '/api/partner/managed-units',
      '/api/partner/rate-card',
      '/api/partner/invoices',
      '/api/partner/scorecard',
    ]) {
      expect([path, await status(o, path, o.re)]).toEqual([path, 403]);
    }
    for (const path of [
      '/api/partner/consultations',
      '/api/partner/inspections',
      '/api/partner/messages',
      '/api/partner/education/sessions',
      '/api/partner/snags',
      '/api/partner/documents',
    ]) {
      expect([path, await status(o, path, o.re)]).toEqual([path, 200]);
    }
  });

  it('C-AZ-1: a JAD Global team never reaches invoices or a rate card; the handover team has its own pages', async () => {
    const o = await offices();
    for (const path of [
      '/api/partner/invoices',
      '/api/partner/invoices/ready',
      '/api/partner/rate-card',
      '/api/partner/quotes',
      '/api/partner/after-hours',
      '/api/partner/education/sessions',
    ]) {
      expect([path, await status(o, path, o.pm)]).toEqual([path, 403]);
    }
    for (const path of ['/api/partner/handovers', '/api/partner/snags', '/api/partner/managed-units']) {
      expect([path, await status(o, path, o.pm)]).toEqual([path, 200]);
    }
  });

  it('C-AZ-1: the maintenance partner has no handovers, managed units, education, consultations or reports', async () => {
    const o = await offices();
    for (const path of [
      '/api/partner/handovers',
      '/api/partner/managed-units',
      '/api/partner/education/sessions',
      '/api/partner/consultations',
      '/api/partner/inspections',
      '/api/partner/snags',
    ]) {
      expect([path, await status(o, path, o.fixers)]).toEqual([path, 403]);
    }
    for (const path of ['/api/partner/rate-card', '/api/partner/invoices', '/api/partner/after-hours']) {
      expect([path, await status(o, path, o.fixers)]).toEqual([path, 200]);
    }
    // A technician of the maintenance partner still reads the after-hours weeks.
    expect(await status(o, '/api/partner/after-hours', o.w.primaryToken)).toBe(200);
    // JAD+ Admin's own routes are unchanged.
    expect(await status(o, '/api/admin/handovers', o.admin)).toBe(200);
    expect(await status(o, '/api/admin/education/sessions', o.admin)).toBe(200);
  });

  it('work in hand keeps its pages after JAD+ ends the assignment', async () => {
    const o = await offices();
    await raise(o.w, leak);
    o.w.h.sqlite.prepare("UPDATE service_partners SET ended_at = ? WHERE partner_id = 'p-primary'").run(NOW);
    const ws = await workspace(o, o.fixers);
    expect(ws.workspace.services).toEqual([]);
    expect(ws.workspace.title).toBe('Maintenance & home services');
    expect(ws.workspace.pages).toContain('jobs');
  });
});

describe('overview per workspace (ADR 0036)', () => {
  it('each office gets only its own sections', async () => {
    const o = await offices();
    const pm = await overview(o, o.pm);
    expect(pm.visits).toBeNull();
    expect(pm.education).toBeNull();
    expect(pm.handover).toEqual({
      inProgress: 0,
      waitingToStart: 0,
      keyCollectionsThisWeek: [],
      snagsOpen: 0,
      snagsReopened: 0,
    });
    expect(pm.managed).toMatchObject({ units: 0, approvalsWaiting: 0, statementsDue: [] });
    expect(pm.consultations).not.toBeNull();
    // No report service: its soft snagging is on the handovers section, never counted twice.
    expect(pm.reports).toBeNull();
    const re = await overview(o, o.re);
    expect([re.visits, re.handover, re.managed]).toEqual([null, null, null]);
    expect(re.education).toEqual({ nextSession: null, booksToSend: 0 });
    expect(re.reports).toEqual({ due: 0, overdue: 0, uploadedThisMonth: 0, snagsOpen: 0 });
    const fixers = await overview(o, o.fixers);
    expect(fixers.visits?.today.emergencies).toEqual([]);
    expect([fixers.handover, fixers.managed, fixers.consultations, fixers.reports, fixers.education]).toEqual(
      [null, null, null, null, null],
    );
  });

  it('O5/P5/S4: a new consultation shows in the pipeline as New with its first-call deadline, then moves', async () => {
    const o = await offices();
    const day = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '';
    const raised = await o.w.h.request('/api/consultations', {
      method: 'POST',
      token: o.w.ownerToken,
      json: {
        sfUnitId: SF_UNIT,
        serviceCode: 'leasing',
        answers: { furnished: 'unfurnished', available_from: '2026-12-15' },
        note: 'Looking for a yearly tenant.',
        bestDate: day,
        bestSlot: 'morning',
        providerId: 'harbor-re',
        consent: true,
        consentVersion: CONSULTATION_CONSENT_VERSION,
      },
    });
    expect(raised.status).toBe(201);
    const board = async (token: string) =>
      partnerConsultationsResponse.parse(
        await (await o.w.h.request('/api/partner/consultations', { token })).json(),
      ).consultations;
    const [first] = await board(o.re);
    expect(first).toMatchObject({
      serviceCode: 'leasing',
      status: 'assigned',
      steps: [],
      unitName: 'JAD288-1100',
    });
    expect(first?.nextDueAt).toBeGreaterThan(NOW);
    // C-AZ-2: the property management team's pipeline does not show another company's consultation.
    expect(await board(o.pm)).toEqual([]);
    const leasing = (await overview(o, o.re)).consultations?.byService.find(
      (s) => s.serviceCode === 'leasing',
    );
    expect(leasing?.columns.find((c) => c.id === 'new')?.count).toBe(1);

    const id = first?.id ?? '';
    const contact = await o.w.h.request(`/api/partner/jobs/${id}/consultation/contact-made`, {
      method: 'POST',
      token: o.re,
      json: { note: 'Spoke with the owner.' },
    });
    expect(contact.status).toBe(200);
    expect((await board(o.re))[0]?.steps).toEqual(['contact_made']);
    // The consultation steps are refused to an office without consultations in its workspace.
    const refused = await o.w.h.request(`/api/partner/jobs/${id}/consultation/contact-made`, {
      method: 'POST',
      token: o.fixers,
      json: { note: 'Not ours.' },
    });
    expect(refused.status).toBe(403);
  });

  it('O3: the inspections board is empty for a new team and lists only the company’s own inspections', async () => {
    const o = await offices();
    const list = partnerInspectionsResponse.parse(
      await (await o.w.h.request('/api/partner/inspections', { token: o.re })).json(),
    );
    expect(list.inspections).toEqual([]);
  });
});

describe('JAD+ Admin: what each provider’s console contains (ADR 0036)', () => {
  it('the partners list carries what each workspace is derived from', async () => {
    const o = await offices();
    const { partners } = adminPartnersResponse.parse(
      await (await o.w.h.request('/api/admin/partners', { token: o.admin })).json(),
    );
    expect(partners.find((p) => p.id === 'harbor-re')).toMatchObject({
      kind: 'jad_group',
      services: expect.arrayContaining(['leasing', 'resale', 'valuation', 'education']) as unknown,
      inHand: [],
      managesUnits: false,
    });
    expect(partners.find((p) => p.id === 'p-primary')?.services).toEqual(['maintenance']);
  });
});
