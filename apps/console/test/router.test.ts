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

describe('hash router (ADR 0023)', () => {
  it('reads every page from the address hash', () => {
    expect(parseHash('#/attention')).toEqual({ name: 'attention' });
    expect(parseHash('#/requests')).toEqual({ name: 'requests', q: '', status: null });
    expect(parseHash('#/requests?q=JAD288&status=assigned')).toEqual({
      name: 'requests',
      q: 'JAD288',
      status: 'assigned',
    });
    expect(parseHash('#/requests/req_123')).toEqual({ name: 'request', id: 'req_123' });
    expect(parseHash('#/partners')).toEqual({ name: 'partners' });
    expect(parseHash('#/jobs')).toEqual({ name: 'jobs' });
    expect(parseHash('#/team')).toEqual({ name: 'team' });
    expect(parseHash('#/numbers?days=30')).toEqual({ name: 'numbers', days: '30' });
  });

  it('ignores what it does not know: unknown status, days or pages, and ids of the wrong shape', () => {
    expect(parseHash('#/requests?status=hacked')).toEqual({ name: 'requests', q: '', status: null });
    expect(parseHash('#/numbers?days=365')).toEqual({ name: 'numbers', days: '7' });
    expect(parseHash('#/admin')).toEqual({ name: 'not_found' });
    expect(parseHash('')).toEqual({ name: 'not_found' });
    expect(parseHash('#/requests/a%2Fb')).toEqual({ name: 'not_found' });
    expect(parseHash('#/requests/abc/extra')).toEqual({ name: 'not_found' });
    expect(parseHash(`#/requests?q=${'x'.repeat(100)}`)).toMatchObject({ q: 'x'.repeat(60) });
  });

  it('writes a route back to the same hash', () => {
    const routes: Route[] = [
      { name: 'attention' },
      { name: 'requests', q: '', status: null },
      { name: 'requests', q: 'Tower & Co', status: 'on_hold' },
      { name: 'request', id: 'abc_1' },
      { name: 'partners' },
      { name: 'jobs' },
      { name: 'team' },
      { name: 'numbers', days: '90' },
    ];
    for (const r of routes) expect(parseHash(formatRoute(r))).toEqual(r);
  });

  it('C-AZ-1: each role opens only its own pages; phone roles open none', () => {
    expect(routeAllowed({ name: 'partners' }, 'jad_admin')).toBe(true);
    expect(routeAllowed({ name: 'partners' }, 'jad_viewer')).toBe(true);
    expect(routeAllowed({ name: 'jobs' }, 'jad_admin')).toBe(false);
    expect(routeAllowed({ name: 'jobs' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'attention' }, 'partner_admin')).toBe(false);
    expect(routeAllowed({ name: 'request', id: 'x' }, 'partner_admin')).toBe(true);
    expect(routeAllowed({ name: 'not_found' }, 'jad_admin')).toBe(false);
    for (const role of ['owner', 'tenant', 'partner'] as const) {
      expect(routeAllowed({ name: 'attention' }, role)).toBe(false);
      expect(navFor(role)).toEqual([]);
    }
  });

  it('starts each role on its home page, with its own navigation', () => {
    expect(homeRoute('jad_admin')).toEqual({ name: 'attention' });
    expect(homeRoute('partner_admin')).toEqual({ name: 'jobs' });
    expect(navFor('jad_viewer').map((n) => n.label)).toEqual(['Needs action', 'Requests', 'Partners']);
    expect(navFor('partner_admin').map((n) => n.label)).toEqual(['Jobs board', 'Team', 'Our numbers']);
  });

  it('marks the current page; a request page belongs to its list', () => {
    expect(isCurrent({ name: 'partners' }, { name: 'partners' })).toBe(true);
    expect(isCurrent({ name: 'requests', q: '', status: null }, { name: 'request', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'jobs' }, { name: 'request', id: 'x' })).toBe(true);
    expect(isCurrent({ name: 'team' }, { name: 'jobs' })).toBe(false);
  });
});
