/** How owners read money, dates and units (R1, O1): same conventions as the prototype. */
import type { OwnerDeal } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { aed, area, longDate, unitTitle } from '../src/portal/format.js';

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
          ...unit,
        },
  instalments: [],
  charges: [],
  receipts: [],
  penalties: [],
});

describe('owner app formatting', () => {
  it('O1: money in AED, whole dirhams unless there are fils', () => {
    expect(aed(1_250_000)).toBe('AED 1,250,000');
    expect(aed(98_000.5)).toBe('AED 98,000.50');
    expect(aed(-25_000)).toBe('-AED 25,000');
  });

  it('dates from Salesforce in either format read as "13 Jul 2026"', () => {
    expect(longDate('2026-07-13')).toBe('13 Jul 2026');
    expect(longDate('30-06-2028')).toBe('30 Jun 2028');
    expect(longDate('Q2 2028')).toBe('Q2 2028');
    expect(longDate(null)).toBe('');
  });

  it('units read as project and number, falling back to the Salesforce name', () => {
    expect(unitTitle(deal({ project: 'J188', number: '1204' }))).toBe('J188 · Unit 1204');
    expect(unitTitle(deal({}))).toBe('1204-J188');
    expect(unitTitle(deal(null))).toBe('DEMO-J188-1204');
    expect(area(1266.8)).toBe('1,266.8 sq ft');
  });
});
