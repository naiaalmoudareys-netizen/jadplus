/**
 * A small typed router on the address hash (ADR 0023): "#/requests?q=JAD&status=assigned". No router library:
 * the console has a handful of pages, and every page a person may open is decided here, by role (deny by
 * default, C-AZ-1). The API checks every call again; this only keeps people on their own pages.
 */
import { STATUSES, type Status, type UserRole } from '@jadplus/shared';

export const STATS_DAYS = ['7', '30', '90'] as const;
export type StatsDays = (typeof STATS_DAYS)[number];

export type Route =
  | { readonly name: 'attention' }
  | { readonly name: 'requests'; readonly q: string; readonly status: Status | null }
  | { readonly name: 'request'; readonly id: string }
  | { readonly name: 'partners' }
  | { readonly name: 'jobs' }
  | { readonly name: 'team' }
  | { readonly name: 'numbers'; readonly days: StatsDays }
  | { readonly name: 'not_found' };

export type RouteName = Route['name'];

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const isStatus = (s: string | null): s is Status => s !== null && (STATUSES as readonly string[]).includes(s);
const isDays = (s: string | null): s is StatsDays =>
  s !== null && (STATS_DAYS as readonly string[]).includes(s);

/** The route for an address hash such as "#/requests/abc". Anything unknown is "not_found". */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = raw.split('?', 2);
  const parts = pathPart.split('/').filter((p) => p !== '');
  const query = new URLSearchParams(queryPart);
  const [first, second, ...rest] = parts;
  if (rest.length > 0) return { name: 'not_found' };
  if (second !== undefined) {
    return first === 'requests' && ID.test(second) ? { name: 'request', id: second } : { name: 'not_found' };
  }
  switch (first) {
    case 'attention':
    case 'partners':
    case 'jobs':
    case 'team':
      return { name: first };
    case 'requests': {
      const status = query.get('status');
      return {
        name: 'requests',
        q: (query.get('q') ?? '').slice(0, 60),
        status: isStatus(status) ? status : null,
      };
    }
    case 'numbers': {
      const days = query.get('days');
      return { name: 'numbers', days: isDays(days) ? days : '7' };
    }
    default:
      return { name: 'not_found' };
  }
}

/** The address hash for a route; parseHash(formatRoute(r)) gives r back. */
export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'requests': {
      const query = new URLSearchParams();
      if (route.q !== '') query.set('q', route.q);
      if (route.status !== null) query.set('status', route.status);
      const qs = query.toString();
      return qs === '' ? '#/requests' : `#/requests?${qs}`;
    }
    case 'request':
      return `#/requests/${route.id}`;
    case 'numbers':
      return `#/numbers?days=${route.days}`;
    case 'not_found':
      return '#/';
    default:
      return `#/${route.name}`;
  }
}

const ADMIN_PAGES: ReadonlySet<RouteName> = new Set(['attention', 'requests', 'request', 'partners']);
const OFFICE_PAGES: ReadonlySet<RouteName> = new Set(['jobs', 'team', 'numbers', 'request']);

/** Pages each console role may open. Phone-app roles have none. */
export function routeAllowed(route: Route, role: UserRole): boolean {
  if (role === 'jad_admin' || role === 'jad_viewer') return ADMIN_PAGES.has(route.name);
  if (role === 'partner_admin') return OFFICE_PAGES.has(route.name);
  return false;
}

/** Where a role starts, and where it lands when it opens a page it may not see. */
export function homeRoute(role: UserRole): Route {
  return role === 'partner_admin' ? { name: 'jobs' } : { name: 'attention' };
}

export interface NavItem {
  readonly label: string;
  readonly route: Route;
}

/** The left navigation for each role. */
export function navFor(role: UserRole): readonly NavItem[] {
  if (role === 'jad_admin' || role === 'jad_viewer') {
    return [
      { label: 'Needs action', route: { name: 'attention' } },
      { label: 'Requests', route: { name: 'requests', q: '', status: null } },
      { label: 'Partners', route: { name: 'partners' } },
    ];
  }
  if (role === 'partner_admin') {
    return [
      { label: 'Jobs board', route: { name: 'jobs' } },
      { label: 'Team', route: { name: 'team' } },
      { label: 'Our numbers', route: { name: 'numbers', days: '7' } },
    ];
  }
  return [];
}

/** Whether a navigation item is the current page (a request page belongs to "Requests" or "Jobs board"). */
export function isCurrent(item: Route, current: Route): boolean {
  if (item.name === current.name) return true;
  return current.name === 'request' && (item.name === 'requests' || item.name === 'jobs');
}
