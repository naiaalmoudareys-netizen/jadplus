/**
 * Day one of the demo company. The base seed's people and providers (same ids and sign-in emails as
 * scripts/seed-local.ts) are put in directly, as an installation would; everything after that goes through the API
 * as JAD+ Admin and the partner offices would do it in the console: staff, new providers with their documents
 * checked, services assigned, teams, skills, rate cards and the property manager's maintenance partner.
 */
import { dubaiDate } from '@jadplus/shared';
import { runPartnerReview } from '../../src/jobs/partner-review.js';
import { createLogger } from '../../src/logger.js';
import { actor, get, post, put, upload } from './actors.js';
import { insertUser, provider, type Company, type Provider } from './company.js';
import { demoPdf } from './files.js';
import { EXTRA_STAFF, JAD_STAFF, NEW_PARTNERS, type DemoPerson } from './people.js';
import { DAY, addDays } from './sim.js';

interface Base {
  readonly id: string;
  readonly name: string;
  readonly kind: 'external' | 'jad_group';
  readonly key: string;
  readonly office: readonly [string, string, string];
  readonly member: readonly [string, string, string];
  readonly services: readonly string[];
}

/** The base seed's providers (scripts/seed-local.ts), kept with their ids and accounts. */
const BASE: readonly Base[] = [
  {
    id: 'demo-partner',
    key: 'fixers',
    name: 'Demo Fixers LLC',
    kind: 'external',
    office: ['demo-office', 'office.demo@jadplus.ae', 'Office Demo'],
    member: ['demo-tech', 'demo@jadplus.ae', 'Sami Demo'],
    services: [],
  },
  {
    id: 'demo-harbor-re',
    key: 're',
    name: 'Harbor Real Estate (demo)',
    kind: 'jad_group',
    office: ['demo-harbor-re-office', 'harbor.re.demo@jadplus.ae', 'Harbor RE Office Demo'],
    member: ['demo-harbor-re-member', 'harbor.re.team.demo@jadplus.ae', 'Harbor RE Agent Demo'],
    services: ['leasing', 'resale', 'valuation', 'education'],
  },
  {
    id: 'demo-harbor-pm',
    key: 'pm',
    name: 'Harbor Property Management (demo)',
    kind: 'jad_group',
    office: ['demo-harbor-pm-office', 'harbor.pm.demo@jadplus.ae', 'Harbor PM Office Demo'],
    member: ['demo-harbor-pm-member', 'harbor.pm.team.demo@jadplus.ae', 'Harbor PM Manager Demo'],
    services: ['handover', 'property-management'],
  },
];

async function installBase(c: Company): Promise<void> {
  const { w } = c;
  const at = c.sim.now;
  const run = (sql: string, ...args: (string | number | null)[]) => w.db.prepare(sql).run(...args);
  await insertUser(w, 'demo-admin', 'admin.demo@jadplus.ae', 'Admin Demo', at);
  run(
    "INSERT INTO user_roles (id, user_id, role, granted_at) VALUES ('demo-grant-admin', 'demo-admin', 'jad_admin', ?)",
    at,
  );
  for (const b of BASE) {
    const [officeId, officeEmail, officeName] = b.office;
    const [memberId, memberEmail, memberName] = b.member;
    await insertUser(w, officeId, officeEmail, officeName, at);
    await insertUser(w, memberId, memberEmail, memberName, at);
    run(
      'INSERT INTO partners (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      b.id,
      b.name,
      b.kind,
      at,
      at,
    );
    run(
      "INSERT INTO user_roles (id, user_id, role, partner_id, granted_at) VALUES (?, ?, 'partner_admin', ?, ?)",
      `${officeId}-grant`,
      officeId,
      b.id,
      at,
    );
    run(
      "INSERT INTO user_roles (id, user_id, role, partner_id, granted_at) VALUES (?, ?, 'partner', ?, ?)",
      `${memberId}-grant`,
      memberId,
      b.id,
      at,
    );
    const techId = b.id === 'demo-partner' ? 'demo-tech-1' : `${memberId}-tech`;
    run(
      'INSERT INTO technicians (id, partner_id, user_id, created_at) VALUES (?, ?, ?, ?)',
      techId,
      b.id,
      memberId,
      at,
    );
    for (const kind of ['trade_licence', 'insurance']) {
      const key = `partners/${b.id}/documents/base-${kind}.pdf`;
      w.objects.set(key, {
        bytes: demoPdf(`${b.name} - ${kind.replace('_', ' ')}`),
        contentType: 'application/pdf',
      });
      run(
        "INSERT INTO partner_documents (id, partner_id, kind, r2_key, expires_on, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, '2027-12-31', ?, 'demo-admin')",
        `${b.id}-${kind}`,
        b.id,
        kind,
        key,
        at,
      );
    }
    for (const code of b.services) {
      run(
        "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, 'primary', ?)",
        `demo-sp-${code}`,
        code,
        b.id,
        at,
      );
    }
    c.providers.set(b.key, {
      id: b.id,
      name: b.name,
      office: actor(officeEmail, 'console'),
      techs: [{ id: techId, actor: actor(memberEmail, 'mobile') }],
    });
  }
}

async function addTeam(c: Company, p: Provider, people: readonly DemoPerson[]): Promise<void> {
  for (const person of people) {
    const { id } = await post<{ id: string }>(c.w, p.office, '/api/partner/team', {
      name: person.name,
      email: person.email,
    });
    p.techs.push({ id, actor: actor(person.email, 'mobile') });
  }
}

async function uploadDocument(
  c: Company,
  p: Provider,
  kind: string,
  expiresOn: string | null,
): Promise<void> {
  const query = expiresOn === null ? '' : `?expiresOn=${expiresOn}`;
  await upload(
    c.w,
    p.office,
    `/api/partner/documents/${kind}${query}`,
    demoPdf(`${p.name} - ${kind.replace(/_/g, ' ')}`),
    'application/pdf',
  );
}

/** JAD+ Admin adds an outside partner; its office sends the documents; JAD+ checks them; the daily check reinstates. */
async function onboard(c: Company, def: (typeof NEW_PARTNERS)[number]): Promise<Provider> {
  const { id } = await post<{ id: string }>(c.w, c.admin, '/api/admin/partners', {
    name: def.name,
    kind: def.kind,
    adminName: def.office.name,
    adminEmail: def.office.email,
  });
  const p: Provider = { id, name: def.name, office: actor(def.office.email, 'console'), techs: [] };
  c.providers.set(def.key, p);
  const today = dubaiDate(c.sim.now);
  // Gulf Shield's insurance runs out about 20 days after "now", so its renewal warning shows today.
  const insurance =
    def.key === 'gulf' ? dubaiDate(c.sim.end + 20 * DAY) : addDays(today, 300 + c.r.int(0, 200));
  await uploadDocument(c, p, 'trade_licence', addDays(today, 400 + c.r.int(0, 300)));
  await uploadDocument(c, p, 'insurance', insurance);
  if (c.r.chance(0.5)) await uploadDocument(c, p, 'signed_sop_sla_kpi', null);
  await addTeam(c, p, def.staff);
  return p;
}

const RATE_ITEMS: Readonly<Record<string, readonly (readonly [string, string, number])[]>> = {
  maintenance: [
    ['Call-out and diagnosis', 'per_visit', 150],
    ['Labour', 'per_hour', 120],
    ['AC gas top-up', 'per_job', 350],
    ['Water heater replacement', 'per_item', 900],
  ],
  snagging: [['Professional snagging inspection, 1-2 bedrooms', 'per_job', 1800]],
  furnishing: [
    ['Furniture package, 1 bedroom', 'per_job', 28_000],
    ['Furniture package, 2 bedrooms', 'per_job', 39_000],
  ],
  'interior-design': [['Interior design concept', 'per_sqm', 95]],
  'golden-visa': [['Golden Visa processing', 'per_job', 4500]],
  mortgage: [['Mortgage advisory', 'per_job', 2500]],
};

async function rateCard(
  c: Company,
  p: Provider,
  service: string,
  effectiveFrom: string,
  uplift = 1,
): Promise<string> {
  const items = (RATE_ITEMS[service] ?? []).map(([item, unit, price]) => ({
    serviceCode: service,
    item,
    unit,
    priceAed: Math.round(price * uplift),
  }));
  const { id } = await post<{ id: string }>(c.w, p.office, '/api/partner/rate-card/changes', {
    effectiveFrom,
    items,
  });
  return id;
}

export async function setupCompany(c: Company): Promise<void> {
  await installBase(c);
  for (const s of JAD_STAFF)
    await post(c.w, c.admin, '/api/admin/staff', { name: s.name, email: s.email, role: s.role });
  for (const def of NEW_PARTNERS) await onboard(c, def);
  const pending = await get<{ uploads: { id: string }[] }>(
    c.w,
    c.admin,
    '/api/admin/partner-documents?status=pending',
  );
  for (const d of pending.uploads)
    await post(c.w, c.admin, `/api/admin/partner-documents/${d.id}/verify`, { decision: 'accept' });
  await runPartnerReview(
    c.w.env.DB,
    c.sim.now,
    createLogger({}, () => undefined),
  );
  const id = (key: string) => c.providers.get(key)?.id ?? null;
  const assign: readonly (readonly [string, string, string | null])[] = [
    ['maintenance', 'fixers', 'gulf'],
    ['snagging', 'precision', null],
    ['furnishing', 'casa', null],
    ['interior-design', 'atelier', null],
    ['golden-visa', 'residency', null],
    ['mortgage', 'crescent', null],
  ];
  for (const [code, primary, backup] of assign) {
    await post(c.w, c.admin, `/api/admin/services/${code}/partners`, {
      primaryId: id(primary),
      backupId: backup === null ? null : id(backup),
    });
  }
  for (const [providerId, people] of Object.entries(EXTRA_STAFF)) {
    const p = [...c.providers.values()].find((x) => x.id === providerId);
    if (p !== undefined) await addTeam(c, p, people);
  }
  const fixers = c.providers.get('fixers');
  const gulf = c.providers.get('gulf');
  const skills = [
    ['plumbing', 'general'],
    ['ac', 'electrical'],
    ['ac', 'appliances'],
    ['carpentry', 'painting', 'general'],
  ];
  for (const p of [fixers, gulf]) {
    for (const [i, t] of (p?.techs ?? []).entries()) {
      if (p !== undefined)
        await put(c.w, p.office, `/api/partner/technicians/${t.id}/skills`, {
          skills: skills[i % skills.length],
        });
    }
  }
  // Rate cards in force from two months in; Casa's is checked later (see residents.ts / ongoing).
  const effective = addDays(dubaiDate(c.sim.now), 61);
  const cards: [string, string][] = [
    ['fixers', 'maintenance'],
    ['gulf', 'maintenance'],
    ['precision', 'snagging'],
    ['casa', 'furnishing'],
    ['crescent', 'mortgage'],
    ['residency', 'golden-visa'],
  ];
  for (const [key, service] of cards) {
    const p = c.providers.get(key);
    if (p === undefined) continue;
    const change = await rateCard(c, p, service, effective);
    await post(c.w, c.admin, `/api/admin/rate-card-changes/${change}`, {
      decision: 'accept',
      approvedBy: 'General Manager (demo)',
    });
  }
  await put(c.w, provider(c, 'pm').office, '/api/partner/manager-settings', { partnerId: 'demo-partner' });
}

/** Near the end: Atelier Nine sends its first rate card, still waiting for JAD+ (the pending change). */
export async function pendingRateCard(c: Company): Promise<void> {
  await rateCard(c, provider(c, 'atelier'), 'interior-design', addDays(dubaiDate(c.sim.now), 62));
}
