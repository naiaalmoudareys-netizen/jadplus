/** Service catalogue and routing: S1, S2, S3. */
import { describe, expect, it } from 'vitest';
import { SERVICES, SERVICE_GROUPS, raiseRequestBody, serviceRouting } from '../src/services.js';

describe('service catalogue', () => {
  it('S1: 12 services, each in one of the three groups, codes unique', () => {
    expect(SERVICES).toHaveLength(12);
    expect(new Set(SERVICES.map((s) => s.code)).size).toBe(12);
    for (const s of SERVICES) expect(SERVICE_GROUPS).toContain(s.group);
  });

  it('S2/S3: a partner service needs an active partner, else "coming soon"; in-house goes to JAD+', () => {
    expect(serviceRouting('partner', true)).toBe('partner');
    expect(serviceRouting('partner', false)).toBe('coming_soon');
    expect(serviceRouting('inhouse', false)).toBe('jad');
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
