/**
 * The left navigation, grouped under section labels (ADR 0036), and which office pages a workspace may open.
 * JAD+ Admin keeps every page it had, now grouped. A partner office sees exactly the pages of its workspace
 * (packages/shared/src/workspace.ts); the API refuses every other office endpoint anyway (C-AZ-1).
 */
import type { OfficePage, UserRole } from '@jadplus/shared';
import { routeAllowed, type Route, type RouteName } from './router';

/** Icons drawn by ui/icons.tsx, one per kind of page. */
export type IconName =
  | 'overview'
  | 'attention'
  | 'requests'
  | 'desk'
  | 'handover'
  | 'education'
  | 'people'
  | 'building'
  | 'offer'
  | 'partner'
  | 'service'
  | 'invoice'
  | 'oncall'
  | 'report'
  | 'audit'
  | 'staff'
  | 'settings'
  | 'dispatch'
  | 'jobs'
  | 'consultation'
  | 'inspection'
  | 'snag'
  | 'quote'
  | 'message'
  | 'unit'
  | 'team'
  | 'performance'
  | 'night'
  | 'document'
  | 'rate';

export interface NavItem {
  readonly label: string;
  readonly route: Route;
  readonly icon: IconName;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const ADMIN_GROUPS: readonly NavGroup[] = [
  {
    label: 'Today',
    items: [
      { label: 'Overview', route: { name: 'overview' }, icon: 'overview' },
      { label: 'Needs action', route: { name: 'attention' }, icon: 'attention' },
    ],
  },
  {
    label: 'Requests',
    items: [
      { label: 'Service requests', route: { name: 'requests', q: '', status: null }, icon: 'requests' },
      { label: 'Documents & account', route: { name: 'desk', status: null }, icon: 'desk' },
      { label: 'Handovers', route: { name: 'handovers' }, icon: 'handover' },
      { label: 'Education', route: { name: 'education' }, icon: 'education' },
    ],
  },
  {
    label: 'People & places',
    items: [
      { label: 'People', route: { name: 'people', q: '' }, icon: 'people' },
      { label: 'Buildings', route: { name: 'buildings' }, icon: 'building' },
      { label: 'Offers', route: { name: 'offers' }, icon: 'offer' },
    ],
  },
  {
    label: 'Providers',
    items: [
      { label: 'Partners', route: { name: 'partners' }, icon: 'partner' },
      { label: 'Services', route: { name: 'services' }, icon: 'service' },
      { label: 'Invoices', route: { name: 'invoices' }, icon: 'invoice' },
    ],
  },
  {
    label: 'Control',
    items: [
      { label: 'On-call', route: { name: 'on_call' }, icon: 'oncall' },
      { label: 'Reports', route: { name: 'reports', month: null }, icon: 'report' },
      { label: 'Audit log', route: { name: 'audit' }, icon: 'audit' },
      { label: 'Staff', route: { name: 'staff' }, icon: 'staff' },
      { label: 'Settings', route: { name: 'settings' }, icon: 'settings' },
    ],
  },
];

/** Every office page with its menu label and route (the label JAD+ Admin also reads on a partner's page). */
export const OFFICE_PAGE_ITEMS: Readonly<Record<OfficePage, NavItem>> = {
  overview: { label: 'Overview', route: { name: 'office' }, icon: 'overview' },
  dispatch: { label: 'Dispatch', route: { name: 'dispatch', date: null }, icon: 'dispatch' },
  jobs: { label: 'Jobs', route: { name: 'jobs' }, icon: 'jobs' },
  consultations: { label: 'Consultations', route: { name: 'consultations' }, icon: 'consultation' },
  inspections: { label: 'Reports', route: { name: 'inspections' }, icon: 'inspection' },
  handovers: { label: 'Handovers', route: { name: 'handovers' }, icon: 'handover' },
  snags: { label: 'Snags to fix', route: { name: 'snags' }, icon: 'snag' },
  quotes: { label: 'Quotes', route: { name: 'quotes' }, icon: 'quote' },
  messages: { label: 'Messages', route: { name: 'messages' }, icon: 'message' },
  managed_units: { label: 'Managed units', route: { name: 'managed_units' }, icon: 'unit' },
  education: { label: 'Education', route: { name: 'education' }, icon: 'education' },
  team: { label: 'Team', route: { name: 'team' }, icon: 'team' },
  performance: { label: 'Performance', route: { name: 'performance', month: null }, icon: 'performance' },
  after_hours: { label: 'After-hours', route: { name: 'after_hours' }, icon: 'night' },
  documents: { label: 'Documents', route: { name: 'documents' }, icon: 'document' },
  rate_card: { label: 'Rate card', route: { name: 'rate_card' }, icon: 'rate' },
  invoices: { label: 'Invoices', route: { name: 'invoices' }, icon: 'invoice' },
};

/** The office menu's sections; each lists its pages in order, and only the workspace's pages are shown. */
const OFFICE_GROUPS: readonly { readonly label: string; readonly pages: readonly OfficePage[] }[] = [
  { label: 'Today', pages: ['overview', 'dispatch'] },
  {
    label: 'Work',
    pages: ['jobs', 'consultations', 'inspections', 'handovers', 'snags', 'education', 'quotes', 'messages'],
  },
  { label: 'Clients', pages: ['managed_units'] },
  { label: 'Company', pages: ['team', 'performance', 'after_hours', 'documents', 'rate_card', 'invoices'] },
];

/** The workspace page each office route belongs to; an item page needs its list page. */
const OFFICE_ROUTE_PAGES: Readonly<Partial<Record<RouteName, readonly OfficePage[]>>> = {
  office: ['overview'],
  dispatch: ['dispatch'],
  jobs: ['jobs'],
  consultations: ['consultations'],
  inspections: ['inspections'],
  snags: ['snags'],
  // A job page opens from any work list.
  request: ['jobs', 'consultations', 'inspections', 'messages', 'quotes'],
  messages: ['messages'],
  quotes: ['quotes'],
  team: ['team'],
  technician: ['team'],
  documents: ['documents'],
  rate_card: ['rate_card'],
  after_hours: ['after_hours'],
  performance: ['performance'],
  invoices: ['invoices'],
  handovers: ['handovers'],
  handover: ['handovers'],
  education: ['education'],
  education_session: ['education'],
  managed_units: ['managed_units'],
  managed_unit: ['managed_units'],
};

/** Whether an office route is in the workspace (ADR 0036). */
export function officeRouteAllowed(route: Route, pages: readonly OfficePage[]): boolean {
  return OFFICE_ROUTE_PAGES[route.name]?.some((p) => pages.includes(p)) === true;
}

/**
 * The grouped navigation of a role: JAD+ Admin's pages (a viewer's without the admin-only ones), or exactly the
 * workspace pages of a partner office (none while its workspace is unknown). Empty groups are left out.
 */
export function navGroups(role: UserRole, pages: readonly OfficePage[] | null = null): NavGroup[] {
  if (role === 'jad_admin' || role === 'jad_viewer') {
    return ADMIN_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((n) => routeAllowed(n.route, role)),
    })).filter((g) => g.items.length > 0);
  }
  if (role !== 'partner_admin' || pages === null) return [];
  return OFFICE_GROUPS.map((g) => ({
    label: g.label,
    items: g.pages.filter((p) => pages.includes(p)).map((p) => OFFICE_PAGE_ITEMS[p]),
  })).filter((g) => g.items.length > 0);
}

/** The same navigation as one list, in order. */
export function navFor(role: UserRole, pages: readonly OfficePage[] | null = null): NavItem[] {
  return navGroups(role, pages).flatMap((g) => g.items);
}

/** The menu labels of a workspace's pages, in menu order (shown to JAD+ Admin on the partner pages). */
export function officePageLabels(pages: readonly OfficePage[]): string[] {
  return OFFICE_GROUPS.flatMap((g) => g.pages)
    .filter((p) => pages.includes(p))
    .map((p) => OFFICE_PAGE_ITEMS[p].label);
}
