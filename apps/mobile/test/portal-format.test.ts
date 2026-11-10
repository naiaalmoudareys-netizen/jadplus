/** How owners read money, dates and units (R1, O1): same conventions as the prototype. */
import type { OwnerDeal } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { langOf } from '../src/i18n/lang.js';
import { aed, area, longDate, unitTitle } from '../src/portal/format.js';

const en = langOf('en');
const ar = langOf('ar');
const fr = langOf('fr');

const deal = (unit: Partial<NonNullable<OwnerDeal['unit']>> | null): OwnerDeal => ({
  id: 'd1',
  ref: 'DEMO-J188-1204',
  stage: 'Sold',
  role: 'Buyer',
  price: 0,
  discount: 0,
  unit:
    unit === null
      ? null
      : {
          name: '1204-J188',
          number: null,
          type: null,
          bedrooms: null,
          bathrooms: null,
          floor: null,
          building: null,
          internalArea: null,
          balconyArea: null,
          totalArea: null,
          view: null,
          parking: null,
          project: null,
          completion: null,
          address: null,
          planFileId: null,
          ...unit,
        },
  instalments: [],
  charges: [],
  receipts: [],
  penalties: [],
});

describe('owner app formatting', () => {
  it('O1: money in AED, whole dirhams unless there are fils', () => {
    expect(aed(1_250_000, en.locale)).toBe('AED 1,250,000');
    expect(aed(98_000.5, en.locale)).toBe('AED 98,000.50');
    expect(aed(-25_000, en.locale)).toBe('-AED 25,000');
  });

  it('dates from Salesforce in either format read as "13 Jul 2026"', () => {
    expect(longDate('2026-07-13', en.locale)).toBe('13 Jul 2026');
    expect(longDate('30-06-2028', en.locale)).toBe('30 Jun 2028');
    expect(longDate('Q2 2028', en.locale)).toBe('Q2 2028');
    expect(longDate(null, en.locale)).toBe('');
  });

  it('units read as project and number, falling back to the Salesforce name', () => {
    expect(unitTitle(deal({ project: 'J188', number: '1204' }), en.t)).toBe('J188 · Unit 1204');
    expect(unitTitle(deal({}), en.t)).toBe('1204-J188');
    expect(unitTitle(deal(null), en.t)).toBe('DEMO-J188-1204');
    expect(area(1266.8, en)).toBe('1,266.8 sq ft');
  });

  it('ADR 0016: money keeps AED with Western digits; dates and units in the chosen language', () => {
    // French groups thousands with a narrow no-break space.
    expect(aed(1_250_000, fr.locale)).toBe('AED 1\u202f250\u202f000');
    expect(aed(1_250_000, ar.locale)).toBe('AED 1,250,000');
    expect(longDate('2026-07-13', ar.locale)).toBe('13 يوليو 2026');
    expect(longDate('30-06-2028', fr.locale)).toBe('30 juin 2028');
    expect(longDate('Q2 2028', fr.locale)).toBe('Q2 2028');
    expect(unitTitle(deal({ project: 'J188', number: '1204' }), ar.t)).toBe('J188 · الوحدة 1204');
    expect(area(1266.8, ar)).toBe('1,266.8 قدم مربع');
  });
});
