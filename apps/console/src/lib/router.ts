/**
 * A small typed router on the address hash (ADR 0023, 0025): "#/requests?q=JAD&status=assigned". No router
 * library: every page a person may open is decided here, by role (deny by default, C-AZ-1), and for a partner
 * office also by its workspace (nav.ts, ADR 0036). The API checks every call again; this only keeps people on
 * their own pages.
 */
import { DESK_STATUSES, STATUSES, type DeskStatus, type Status, type UserRole } from '@jadplus/shared';

export type Route =
  // JAD+ Admin
  | { readonly name: 'overview' }
  | { readonly name: 'attention' }
  | { readonly name: 'requests'; readonly q: string; readonly status: Status | null }
  | { readonly name: 'request'; readonly id: string }
  | { readonly name: 'people'; readonly q: string }
  | { readonly name: 'person'; readonly id: string }
  | { readonly name: 'desk'; readonly status: DeskStatus | null }
  | { readonly name: 'desk_item'; readonly id: string }
  | { readonly name: 'partners' }
  | { readonly name: 'partner'; readonly id: string }
  | { readonly name: 'services' }
  | { readonly name: 'buildings' }
  | { readonly name: 'building'; readonly project: string; readonly building: string | null }
  | { readonly name: 'offers' }
  | { readonly name: 'on_call' }
  | { readonly name: 'reports'; readonly month: string | null }
  | { readonly name: 'audit' }
  | { readonly name: 'staff' }
  | { readonly name: 'settings' }
  // Both consoles: each role gets its own invoices page (ADR 0026, being built).
  | { readonly name: 'invoices' }
  // Both consoles: handover checklists and investor education (ADR 0033).
  | { readonly name: 'handovers' }
  | { readonly name: 'handover'; readonly id: string }
  | { readonly name: 'education' }
  | { readonly name: 'education_session'; readonly id: string }
  // Partner office
  | { readonly name: 'office' }
  | { readonly name: 'dispatch'; readonly date: string | null }
  | { readonly name: 'jobs' }
  | { readonly name: 'messages' }
  | { readonly name: 'quotes' }
  | { readonly name: 'team' }
  | { readonly name: 'technician'; readonly id: string }
  | { readonly name: 'documents' }
  | { readonly name: 'rate_card' }
  | { readonly name: 'after_hours' }
  | { readonly name: 'performance'; readonly month: string | null }
  // Partner office of a property management team (ADR 0034)
  | { readonly name: 'managed_units' }
  // Partner office work boards (ADR 0036)
  | { readonly name: 'consultations' }
  | { readonly name: 'inspections' }
  | { readonly name: 'snags' }
  | { readonly name: 'managed_unit'; readonly id: string }
  | { readonly name: 'not_found' };

export type RouteName = Route['name'];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The names of routes that carry nothing but their name. */
type NameOnly<R> = R extends { readonly name: infer N }
  ? [Exclude<keyof R, 'name'>] extends [never]
    ? N
    : never
  : never;
type SimpleName = NameOnly<Route>;

/** Pages without parameters, by the path in the address. */
const SIMPLE: Readonly<Record<string, SimpleName>> = {
  overview: 'overview',
  attention: 'attention',
  partners: 'partners',
  services: 'services',
  buildings: 'buildings',
  offers: 'offers',
  'on-call': 'on_call',
  audit: 'audit',
  staff: 'staff',
  settings: 'settings',
  invoices: 'invoices',
  handovers: 'handovers',
  education: 'education',
  office: 'office',
  jobs: 'jobs',
  messages: 'messages',
  quotes: 'quotes',
  team: 'team',
  documents: 'documents',
  'rate-card': 'rate_card',
  'after-hours': 'after_hours',
  'managed-units': 'managed_units',
  consultations: 'consultations',
  inspections: 'inspections',
  'snags-to-fix': 'snags',
};
const PATH_OF: Readonly<Partial<Record<RouteName, string>>> = Object.fromEntries(
  Object.entries(SIMPLE).map(([path, name]) => [name, path]),
);

/** Pages for one item: "#/people/abc". */
const ITEM: Readonly<
  Record<
    string,
    | 'request'
    | 'person'
    | 'desk_item'
    | 'partner'
    | 'technician'
    | 'handover'
    | 'education_session'
    | 'managed_unit'
  >
> = {
  requests: 'request',
  people: 'person',
  desk: 'desk_item',
  partners: 'partner',
  team: 'technician',
  handovers: 'handover',
  education: 'education_session',
  'managed-units': 'managed_unit',
};

const isStatus = (s: string | null): s is Status => s !== null && (STATUSES as readonly string[]).includes(s);
const isDeskStatus = (s: string | null): s is DeskStatus =>
  s !== null && (DESK_STATUSES as readonly string[]).includes(s);
const text = (s: string | null, max: number): string => (s ?? '').slice(0, max);
const month = (s: string | null): string | null => (s !== null && MONTH.test(s) ? s : null);

function itemRoute(first: string, id: string): Route {
  const name = ITEM[first];
  return name === undefined || !ID.test(id) ? { name: 'not_found' } : { name, id };
}

/** The route for an address hash such as "#/requests/abc". Anything unknown is "not_found". */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = raw.split('?', 2);
  const parts = pathPart.split('/').filter((p) => p !== '');
  const query = new URLSearchParams(queryPart);
  const [first = '', second, ...rest] = parts;
  if (rest.length > 0) return { name: 'not_found' };
  if (second !== undefined) return itemRoute(first, second);
  switch (first) {
    case 'requests': {
      const status = query.get('status');
      return { name: 'requests', q: text(query.get('q'), 60), status: isStatus(status) ? status : null };
    }
    case 'people':
      return { name: 'people', q: text(query.get('q'), 120) };
    case 'desk': {
      const status = query.get('status');
      return { name: 'desk', status: isDeskStatus(status) ? status : null };
    }
    case 'building': {
      const project = text(query.get('project'), 120);
      const building = query.get('building');
      if (project === '') return { name: 'not_found' };
      return { name: 'building', project, building: building === null ? null : text(building, 80) };
    }
    case 'reports':
      return { name: 'reports', month: month(query.get('month')) };
    case 'performance':
      return { name: 'performance', month: month(query.get('month')) };
    case 'dispatch': {
      const date = query.get('date');
      return { name: 'dispatch', date: date !== null && DATE.test(date) ? date : null };
    }
    default: {
      const name = SIMPLE[first];
      // Safe: a SimpleName is by definition a route carrying nothing but its name (NameOnly above); TypeScript
      // stops checking that member by member once the union has more than 25 routes.
      return name === undefined ? { name: 'not_found' } : ({ name } as Route);
    }
  }
}

function withQuery(path: string, query: Readonly<Record<string, string | null>>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== null && v !== '') params.set(k, v);
  const qs = params.toString();
  return qs === '' ? `#/${path}` : `#/${path}?${qs}`;
}

/** The address hash for a route; parseHash(formatRoute(r)) gives r back. */
export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'requests':
      return withQuery('requests', { q: route.q, status: route.status });
    case 'request':
      return `#/requests/${route.id}`;
    case 'people':
      return withQuery('people', { q: route.q });
    case 'person':
      return `#/people/${route.id}`;
    case 'desk':
      return withQuery('desk', { status: route.status });
    case 'desk_item':
      return `#/desk/${route.id}`;
    case 'partner':
      return `#/partners/${route.id}`;
    case 'technician':
      return `#/team/${route.id}`;
    case 'handover':
      return `#/handovers/${route.id}`;
    case 'education_session':
      return `#/education/${route.id}`;
    case 'managed_unit':
      return `#/managed-units/${route.id}`;
    case 'building':
      return withQuery('building', { project: route.project, building: route.building });
    case 'reports':
      return withQuery('reports', { month: route.month });
    case 'performance':
      return withQuery('performance', { month: route.month });
    case 'dispatch':
      return withQuery('dispatch', { date: route.date });
    case 'not_found':
      return '#/';
    default:
      return `#/${PATH_OF[route.name] ?? ''}`;
  }
}

/** Pages JAD+ Admin and JAD+ viewers may open. */
const ADMIN_PAGES: ReadonlySet<RouteName> = new Set<RouteName>([
  'overview',
  'attention',
  'requests',
  'request',
  'people',
  'person',
  'desk',
  'desk_item',
  'partners',
  'partner',
  'services',
  'buildings',
  'building',
  'offers',
  'on_call',
  'reports',
  'settings',
  'invoices',
  'handovers',
  'handover',
  'education',
  'education_session',
]);
/** Staff accounts and the audit log are for JAD+ Admin only (the API refuses viewers too). */
const ADMIN_ONLY_PAGES: ReadonlySet<RouteName> = new Set<RouteName>(['audit', 'staff']);
const OFFICE_PAGES: ReadonlySet<RouteName> = new Set<RouteName>([
  'office',
  'dispatch',
  'jobs',
  'request',
  'messages',
  'quotes',
  'team',
  'technician',
  'documents',
  'rate_card',
  'after_hours',
  'performance',
  'invoices',
  'handovers',
  'handover',
  'education',
  'education_session',
  'managed_units',
  'managed_unit',
  'consultations',
  'inspections',
  'snags',
]);

/** Pages each console role may open. Phone-app roles have none. */
export function routeAllowed(route: Route, role: UserRole): boolean {
  if (role === 'jad_admin') return ADMIN_PAGES.has(route.name) || ADMIN_ONLY_PAGES.has(route.name);
  if (role === 'jad_viewer') return ADMIN_PAGES.has(route.name);
  if (role === 'partner_admin') return OFFICE_PAGES.has(route.name);
  return false;
}

/** Where a role starts, and where it lands when it opens a page it may not see. */
export function homeRoute(role: UserRole): Route {
  return role === 'partner_admin' ? { name: 'office' } : { name: 'overview' };
}

/** The list page an item page belongs to, for the navigation highlight. */
const PARENT: Readonly<Partial<Record<RouteName, readonly RouteName[]>>> = {
  request: ['requests', 'jobs'],
  person: ['people'],
  desk_item: ['desk'],
  partner: ['partners'],
  building: ['buildings'],
  technician: ['team'],
  handover: ['handovers'],
  education_session: ['education'],
  managed_unit: ['managed_units'],
};

/** Whether a navigation item is the current page (an item page belongs to its list). */
export function isCurrent(item: Route, current: Route): boolean {
  if (item.name === current.name) return true;
  return PARENT[current.name]?.includes(item.name) === true;
}
