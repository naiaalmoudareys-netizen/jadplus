/** Service catalogue, flows and routing: S1, S2, S3, P6, ADR 0030. */
import { describe, expect, it } from 'vitest';
import {
  SERVICES,
  SERVICE_FLOWS,
  SERVICE_GROUPS,
  providerFits,
  providerKindFor,
  raiseRequestBody,
  serviceOpenTo,
  serviceRouting,
} from '../src/services.js';

describe('service catalogue', () => {
  it('S1: 12 services, each in one of the three groups, codes unique', () => {
    expect(SERVICES).toHaveLength(12);
    expect(new Set(SERVICES.map((s) => s.code)).size).toBe(12);
    for (const s of SERVICES) expect(SERVICE_GROUPS).toContain(s.group);
  });

  it('S2/S3: a partner service needs an active partner, else "coming soon"', () => {
    expect(serviceRouting('partner', true)).toBe('partner');
    expect(serviceRouting('partner', false)).toBe('coming_soon');
  });

  it('P6: an in-house service goes to its JAD Global team, and is "coming soon" while it has none', () => {
    expect(serviceRouting('inhouse', true)).toBe('jad');
    expect(serviceRouting('inhouse', false)).toBe('coming_soon');
  });

  it('ADR 0030: in-house services take JAD Global teams, partner services outside partners', () => {
    expect(providerKindFor('inhouse')).toBe('jad_group');
    expect(providerKindFor('partner')).toBe('external');
    expect(providerFits('inhouse', 'jad_group')).toBe(true);
    expect(providerFits('inhouse', 'external')).toBe(false);
    expect(providerFits('partner', 'external')).toBe(true);
    expect(providerFits('partner', 'jad_group')).toBe(false);
  });

  it('ADR 0030: each service has its flow (visit, report, consultation or booking)', () => {
    const flow = Object.fromEntries(SERVICES.map((s) => [s.code, s.flow]));
    expect(flow).toEqual({
      maintenance: 'visit',
      snagging: 'report',
      handover: 'visit',
      'property-management': 'consultation',
      leasing: 'consultation',
      resale: 'consultation',
      valuation: 'report',
      mortgage: 'consultation',
      'golden-visa': 'consultation',
      furnishing: 'visit',
      'interior-design': 'visit',
      education: 'booking',
    });
    for (const s of SERVICES) expect(SERVICE_FLOWS).toContain(s.flow);
  });

  it('C-VAL-1: a request names exactly one place, a known service, what is needed and when', () => {
    const unit = 'a0X000000000001AAA';
    const when = { preferredDate: '2026-11-10', preferredSlot: 'morning' };
    expect(
      raiseRequestBody.safeParse({ sfUnitId: unit, serviceCode: 'maintenance', description: 'Tap', ...when })
        .success,
    ).toBe(true);
    expect(
      raiseRequestBody.safeParse({ serviceCode: 'maintenance', description: 'Tap', ...when }).success,
    ).toBe(false);
    expect(
      raiseRequestBody.safeParse({ sfUnitId: unit, serviceCode: 'teleport', description: 'x', ...when })
        .success,
    ).toBe(false);
    expect(
      raiseRequestBody.safeParse({ sfUnitId: unit, serviceCode: 'maintenance', description: ' ', ...when })
        .success,
    ).toBe(false);
    expect(
      raiseRequestBody.safeParse({ sfUnitId: unit, serviceCode: 'maintenance', description: 'Tap' }).success,
    ).toBe(false);
  });
});

describe('who may request what (R2)', () => {
  it('R2: a tenant requests repairs only; an owner any service', () => {
    expect(serviceOpenTo('tenant', 'maintenance')).toBe(true);
    for (const code of ['resale', 'valuation', 'leasing', 'golden-visa', 'furnishing', 'snagging']) {
      expect(serviceOpenTo('tenant', code)).toBe(false);
      expect(serviceOpenTo('owner', code)).toBe(true);
    }
  });
});
