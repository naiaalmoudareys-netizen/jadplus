import { describe, expect, it } from 'vitest';
import {
  formatRoute,
  homeRoute,
  isCurrent,
  navFor,
  parseHash,
  routeAllowed,
  type Route,
} from '../src/lib/router';

describe('hash router (ADR 0023, 0025)', () => {
  it('reads every page from the address hash', () => {
    expect(parseHash('#/overview')).toEqual({ name: 'overview' });
    expect(parseHash('#/attention')).toEqual({ name: 'attention' });
    expect(parseHash('#/requests')).toEqual({ name: 'requests', q: '', status: null });
    expect(parseHash('#/requests?q=JAD288&status=assigned')).toEqual({
      name: 'requests',
      q: 'JAD288',
      status: 'assigned',
    });
    expect(parseHash('#/requests/req_123')).toEqual({ name: 'request', id: 'req_123' });
    expect(parseHash('#/people?q=demo%40jadplus.ae')).toEqual({ name: 'people', q: 'demo@jadplus.ae' });
    expect(parseHash('#/people/u_1')).toEqual({ name: 'person', id: 'u_1' });
    expect(parseHash('#/desk?status=In%20progress')).toEqual({ name: 'desk', status: 'In progress' });
    expect(parseHash('#/desk/d1')).toEqual({ name: 'desk_item', id: 'd1' });
    expect(parseHash('#/partners/p1')).toEqual({ name: 'partner', id: 'p1' });
    expect(parseHash('#/building?project=JAD%20288&building=B')).toEqual({
      name: 'building',
      project: 'JAD 288',
      building: 'B',
    });
    expect(parseHash('#/building?project=JAD%20288')).toEqual({
      name: 'building',
      project: 'JAD 288',
      building: null,
    });
    expect(parseHash('#/on-call')).toEqual({ name: 'on_call' });
    expect(parseHash('#/reports?month=2026-10')).toEqual({ name: 'reports', month: '2026-10' });
    expect(parseHash('#/dispatch?date=2026-11-12')).toEqual({ name: 'dispatch', date: '2026-11-12' });
    expect(parseHash('#/team/t1')).toEqual({ name: 'technician', id: 't1' });
    expect(parseHash('#/rate-card')).toEqual({ name: 'rate_card' });
    expect(parseHash('#/after-hours')).toEqual({ name: 'after_hours' });
    expect(parseHash('#/performance')).toEqual({ name: 'performance', month: null });
    expect(parseHash('#/invoices')).toEqual({ name: 'invoices' });
  });

  it('ignores what it does not know: unknown status, months, dates or pages, and ids of the wrong shape', () => {
    expect(parseHash('#/requests?status=hacked')).toEqual({ name: 'requests', q: '', status: null });
    expect(parseHash('#/desk?status=Done')).toEqual({ name: 'desk', status: null });
    expect(parseHash('#/reports?month=2026-13')).toEqual({ name: 'reports', month: null });
    expect(parseHash('#/dispatch?date=tomorrow')).toEqual({ name: 'dispatch', date: null });
    expect(parseHash('#/building')).toEqual({ name: 'not_found' });
    expect(parseHash('#/admin')).toEqual({ name: 'not_found' });
    expect(parseHash('#/numbers')).toEqual({ name: 'not_found' });
    expect(parseHash('')).toEqual({ name: 'not_found' });
    expect(parseHash('#/requests/a%2Fb')).toEqual({ name: 'not_found' });
    expect(parseHash('#/settings/x')).toEqual({ name: 'not_found' });
    expect(parseHash('#/requests/abc/extra')).toEqual({ name: 'not_found' });
    expect(parseHash(`#/requests?q=${'x'.repeat(100)}`)).toMatchObject({ q: 'x'.repeat(60) });
  });

  it('writes a route back to the same hash', () => {
    const routes: Route[] = [
      { name: 'overview' },
      { name: 'attention' },
      { name: 'requests', q: '', status: null },
      { name: 'requests', q: 'Tower & Co', status: 'on_hold' },
      { name: 'request', id: 'abc_1' },
      { name: 'people', q: '+971 50 000 0000' },
      { name: 'person', id: 'u1' },
      { name: 'desk', status: null },
      { name: 'desk', status: 'Completed' },
      { name: 'desk_item', id: 'd1' },
      { name: 'partners' },
      { name: 'partner', id: 'p1' },
      { name: 'services' },
      { name: 'buildings' },
      { name: 'building', project: 'JAD 288', building: null },
      { name: 'building', project: 'JAD 288', building: 'Tower A & B' },
      { name: 'offers' },
      { name: 'on_call' },
      { name: 'reports', month: null },
      { name: 'reports', month: '2026-02' },
      { name: 'audit' },
      { name: 'staff' },
      { name: 'settings' },
      { name: 'invoices' },
      { name: 'office' },
      { name: 'dispatch', date: null },
      { name: 'dispatch', date: '2026-11-12' },
      { name: 'jobs' },
      { name: 'messages' },
      { name: 'quotes' },
      { name: 'team' },
      { name: 'technician', id: 't1' },
      { name: 'documents' },
      { name: 'rate_card' },
      { name: 'after_hours' },
      { name: 'performance', month: '2026-11' },
    ];
    for (const r of routes) expect(parseHash(formatRoute(r))).toEqual(r);
  });

  it('C-AZ-1: each role opens only its own pages; phone roles open none', () => {
    expect(routeAllowed({ name: 'partners' }, 'jad_admin')).toBe(true);
    expect(routeAllowed({ name: 'partners' }, 'jad_viewer')).toBe(true);
    expect(routeAllowed({ name: 'jobs' }, 'jad_admin')).toBe(false);
    expect(routeAllowed({ name: 'dispatch', date: null }, 'jad_admin')).toBe(false);
    expect(routeAllowed({ name: 'jobs' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'attention' }, 'partner_admin')).toBe(false);
    expect(routeAllowed({ name: 'person', id: 'x' }, 'partner_admin')).toBe(false);
    expect(routeAllowed({ name: 'request', id: 'x' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'invoices' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'not_found' }, 'jad_admin')).toBe(false);
    for (const role of ['owner', 'tenant', 'partner'] as const) {
      expect(routeAllowed({ name: 'attention' }, role)).toBe(false);
      expect(routeAllowed({ name: 'jobs' }, role)).toBe(false);
      expect(navFor(role)).toEqual([]);
    }
  });

  it('C-AZ-1: staff accounts and the audit log are for JAD+ Admin only, not viewers', () => {
    expect(routeAllowed({ name: 'audit' }, 'jad_admin')).toBe(true);
    expect(routeAllowed({ name: 'staff' }, 'jad_admin')).toBe(true);
    expect(routeAllowed({ name: 'audit' }, 'jad_viewer')).toBe(false);
    expect(routeAllowed({ name: 'staff' }, 'jad_viewer')).toBe(false);
    expect(routeAllowed({ name: 'staff' }, 'partner_admin')).toBe(false);
  });

  it('starts each role on its overview, with its own navigation', () => {
    expect(homeRoute('jad_admin')).toEqual({ name: 'overview' });
    expect(homeRoute('jad_viewer')).toEqual({ name: 'overview' });
    expect(homeRoute('partner_admin')).toEqual({ name: 'office' });
    expect(navFor('jad_admin').map((n) => n.label)).toEqual([
      'Overview',
      'Needs action',
      'Service requests',
      'People',
      'Documents & account',
      'Partners',
      'Services',
      'Buildings',
      'Offers',
      'Handovers',
      'Education',
      'On-call',
      'Reports',
      'Audit log',
      'Staff',
      'Settings',
      'Invoices',
    ]);
    expect(navFor('jad_viewer').map((n) => n.label)).not.toContain('Audit log');
    expect(navFor('jad_viewer').map((n) => n.label)).not.toContain('Staff');
    const everything = {
      kind: 'jad_group' as const,
      services: ['handover', 'education', 'property-management'],
      managesUnits: true,
    };
    expect(navFor('partner_admin', everything).map((n) => n.label)).toEqual([
      'Overview',
      'Dispatch',
      'Jobs',
      'Messages',
      'Quotes',
      'Team',
      'Documents',
      'Rate card',
      'After-hours',
      'Performance',
      'Invoices',
      'Handovers',
      'Education',
      'Managed units',
    ]);
    for (const role of ['jad_admin', 'jad_viewer', 'partner_admin'] as const) {
      for (const item of navFor(role, everything)) expect(routeAllowed(item.route, role)).toBe(true);
    }
  });

  it('marks the current page; an item page belongs to its list', () => {
    expect(isCurrent({ name: 'partners' }, { name: 'partners' })).toBe(true);
    expect(isCurrent({ name: 'requests', q: '', status: null }, { name: 'request', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'jobs' }, { name: 'request', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'people', q: '' }, { name: 'person', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'desk', status: null }, { name: 'desk_item', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'partners' }, { name: 'partner', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'buildings' }, { name: 'building', project: 'P', building: null })).toBe(true);
    expect(isCurrent({ name: 'team' }, { name: 'technician', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'reports', month: null }, { name: 'reports', month: '2026-10' })).toBe(true);
    expect(isCurrent({ name: 'team' }, { name: 'jobs' })).toBe(false);
  });
});
