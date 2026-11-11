/**
 * Provider workspaces (ADR 0036): each partner office's console is exactly its work. From the services the company
 * holds (service_partners, primary or backup, still active), the services of the open requests it still has in
 * hand, its kind (outside partner or JAD Global team) and whether it manages units today, these pure rules give
 * the workspace's title, the services it handles and the exact set of console pages. The API refuses every office
 * endpoint outside that set (403) and the console shows only those pages, so the menu and the boundary agree.
 */
import { SERVICES, type ProviderKind, type ServiceFlow } from './services.js';

/** Every page a partner office console can have, in menu order. */
export const OFFICE_PAGES = [
  'overview',
  'dispatch',
  'jobs',
  'consultations',
  'inspections',
  'handovers',
  'snags',
  'quotes',
  'messages',
  'managed_units',
  'education',
  'team',
  'performance',
  'after_hours',
  'documents',
  'rate_card',
  'invoices',
] as const;
export type OfficePage = (typeof OFFICE_PAGES)[number];

/** The kinds of work a provider does; a company may do several (its overview stacks them). */
export const WORK_AREAS = ['property', 'home', 'advisory'] as const;
export type WorkArea = (typeof WORK_AREAS)[number];

/** Which kind of work each service belongs to. */
const AREA_OF: Readonly<Record<string, WorkArea>> = {
  handover: 'property',
  'property-management': 'property',
  maintenance: 'home',
  snagging: 'home',
  furnishing: 'home',
  'interior-design': 'home',
  leasing: 'advisory',
  resale: 'advisory',
  valuation: 'advisory',
  mortgage: 'advisory',
  'golden-visa': 'advisory',
  education: 'advisory',
};

/**
 * Visit services whose work can be quoted to the owner (A2, A3). Handover is a visit service but is never
 * charged through a quote, so a handover team has no Quotes page.
 */
export const QUOTED_SERVICES: ReadonlySet<string> = new Set(['maintenance', 'furnishing', 'interior-design']);

/** What the workspace is derived from. */
export interface WorkspaceInput {
  readonly kind: ProviderKind;
  /** Services the company is assigned to now (primary or backup). */
  readonly services: readonly string[];
  /** Services of open requests it still has (e.g. after JAD+ ended an assignment): it must be able to finish them. */
  readonly inHand: readonly string[];
  /** Whether it manages at least one unit today (ADR 0034). */
  readonly managesUnits: boolean;
}

export interface Workspace {
  readonly title: string;
  readonly subtitle: string;
  /** Its kinds of work, the main one first. */
  readonly areas: WorkArea[];
  /** Titles of the other kinds of work it also does ("also: ..."). */
  readonly also: string[];
  /** The services it is assigned to now, in catalogue order. */
  readonly services: { code: string; name: string }[];
  /** Its console pages, in menu order. */
  readonly pages: OfficePage[];
}

const FLOW_OF: ReadonlyMap<string, ServiceFlow> = new Map(SERVICES.map((s) => [s.code, s.flow]));
const NAME_OF: ReadonlyMap<string, string> = new Map(SERVICES.map((s) => [s.code, s.name]));
const CATALOGUE_ORDER: readonly string[] = SERVICES.map((s) => s.code);

const has = (codes: ReadonlySet<string>, ...wanted: string[]): boolean => wanted.some((c) => codes.has(c));

/** The exact console pages of a company (ADR 0036). */
export function officePages(input: WorkspaceInput): OfficePage[] {
  const codes = new Set([...input.services, ...input.inHand]);
  const flows = new Set([...codes].map((c) => FLOW_OF.get(c)));
  const visits = flows.has('visit');
  const requests = visits || flows.has('report') || flows.has('consultation');
  const pages = new Set<OfficePage>(['overview', 'team', 'documents']);
  const add = (when: boolean, ...more: OfficePage[]): void => {
    if (when) for (const p of more) pages.add(p);
  };
  add(visits, 'dispatch', 'jobs', 'performance');
  add(
    [...codes].some((c) => QUOTED_SERVICES.has(c)),
    'quotes',
  );
  add(requests, 'messages');
  add(flows.has('consultation'), 'consultations');
  // The handover team carries out soft snagging (O3, ADR 0032), so it has inspections and reports too.
  add(flows.has('report') || codes.has('handover'), 'inspections');
  add(codes.has('handover'), 'handovers', 'snags');
  add(codes.has('property-management') || input.managesUnits, 'managed_units');
  add(codes.has('education'), 'education');
  // After-hours contacts exist for emergencies, and only maintenance takes emergencies (E1-E7).
  add(codes.has('maintenance'), 'after_hours');
  // JAD Global teams do not invoice owners through JAD+ and have no partner rate card (ADR 0036).
  add(input.kind === 'external', 'rate_card', 'invoices');
  return OFFICE_PAGES.filter((p) => pages.has(p));
}

function areaTitle(area: WorkArea, codes: ReadonlySet<string>, managesUnits: boolean): string {
  switch (area) {
    case 'property': {
      const managing = codes.has('property-management') || managesUnits;
      if (codes.has('handover') && managing) return 'Property management & handover';
      return codes.has('handover') ? 'Handover management' : 'Property management';
    }
    case 'home':
      return 'Maintenance & home services';
    case 'advisory':
      if (has(codes, 'leasing', 'resale', 'valuation')) return 'Sales & leasing advisory';
      return has(codes, 'mortgage', 'golden-visa') ? 'Finance & residency advisory' : 'Investor education';
  }
}

function areaSubtitle(area: WorkArea, codes: ReadonlySet<string>, managesUnits: boolean): string {
  switch (area) {
    case 'property': {
      const managing = codes.has('property-management') || managesUnits;
      if (codes.has('handover') && managing) {
        return 'Handovers to key collection, snags to fix, and the units you manage for owners.';
      }
      return codes.has('handover')
        ? 'Handovers from completion to key collection, and snags to fix.'
        : 'The units you manage for owners: tenants, repairs and monthly statements.';
    }
    case 'home':
      return 'Repairs, emergencies and home visits, from booking to work done.';
    case 'advisory':
      return 'Owner consultations from first call to outcome, reports and investor sessions.';
  }
}

/** The workspace of a company: its title, the services it handles and its pages (ADR 0036). */
export function workspaceFor(input: WorkspaceInput): Workspace {
  // The title comes from what the company is assigned to; a company with none yet is named by its work in hand.
  const titled = new Set(input.services.length > 0 ? input.services : input.inHand);
  const counts = new Map<WorkArea, number>();
  for (const code of titled) {
    const area = AREA_OF[code];
    if (area !== undefined) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  if (input.managesUnits && !counts.has('property')) counts.set('property', 1);
  // Most services first; on a tie, the order of WORK_AREAS.
  const areas = WORK_AREAS.filter((a) => counts.has(a)).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  );
  const [main] = areas;
  const services = CATALOGUE_ORDER.filter((c) => input.services.includes(c)).map((code) => ({
    code,
    name: NAME_OF.get(code) ?? code,
  }));
  const pages = officePages(input);
  if (main === undefined) {
    return {
      title: input.kind === 'jad_group' ? 'JAD Global team' : 'Partner office',
      subtitle: 'No services assigned yet. JAD+ Admin assigns services on the Services page.',
      areas: [],
      also: [],
      services,
      pages,
    };
  }
  return {
    title: areaTitle(main, titled, input.managesUnits),
    subtitle: areaSubtitle(main, titled, input.managesUnits),
    areas,
    also: areas.slice(1).map((a) => areaTitle(a, titled, input.managesUnits)),
    services,
    pages,
  };
}

/** Whether the workspace has a page. */
export function workspaceHas(ws: Pick<Workspace, 'pages'>, page: OfficePage): boolean {
  return ws.pages.includes(page);
}

/** The overview sections a workspace can show (GET /api/partner/overview). */
export const OVERVIEW_SECTIONS = [
  'visits',
  'handover',
  'managed',
  'consultations',
  'reports',
  'education',
] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

/** Each kind of work's sections, in the order its overview shows them. */
const AREA_SECTIONS: Readonly<Record<WorkArea, readonly OverviewSection[]>> = {
  property: ['handover', 'managed', 'consultations', 'reports'],
  home: ['visits', 'reports', 'consultations'],
  advisory: ['consultations', 'reports', 'education'],
};

/** The page a section belongs to: a workspace shows the section only with that page. */
const SECTION_PAGE: Readonly<Record<Exclude<OverviewSection, 'visits'>, OfficePage>> = {
  handover: 'handovers',
  managed: 'managed_units',
  consultations: 'consultations',
  reports: 'inspections',
  education: 'education',
};

/**
 * The overview sections of a workspace, stacked in a sensible order: the main kind of work first, then the
 * others. "Today's visits" belongs to home services only (a handover team's visits are on its handovers), and
 * "Reports" only to a company that holds a report service (snagging, valuation): a handover team's soft snagging
 * is already counted on its handovers section, so the overview never shows the same figure twice.
 */
export function overviewSections(ws: Pick<Workspace, 'areas' | 'pages' | 'services'>): OverviewSection[] {
  const out: OverviewSection[] = [];
  const reports = ws.services.some((s) => FLOW_OF.get(s.code) === 'report');
  for (const area of ws.areas) {
    for (const s of AREA_SECTIONS[area]) {
      const shown =
        s === 'visits' ? area === 'home' : ws.pages.includes(SECTION_PAGE[s]) && (s !== 'reports' || reports);
      if (shown && !out.includes(s)) out.push(s);
    }
  }
  return out;
}
