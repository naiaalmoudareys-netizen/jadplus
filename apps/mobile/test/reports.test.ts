/** The owner app's report screens (ADR 0032): O3 (snagging choice, snag list, unit documents), L2 wording. */
import { LANGUAGES, VALUATION_DISCLAIMER, type OwnerReport } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { DICTIONARY } from '../src/i18n/dictionary.js';
import { fill } from '../src/i18n/translate.js';
import {
  REPORT_TITLE,
  SNAGGING_OPTIONS,
  SNAG_STATUS,
  reportsForUnit,
  snagCounts,
} from '../src/requests/reportLogic.js';

const report = (over: Partial<OwnerReport>): OwnerReport => ({
  id: 'rep-1',
  kind: 'snagging',
  uploadedAt: 0,
  byteSize: 600,
  requestId: 'req-1',
  ref: 'JAD-7KQ4M2',
  sfUnitId: 'a0X000000000001AAA',
  unitName: '1204-J188',
  service: 'snagging',
  ...over,
});

describe('report screens (O3, L2)', () => {
  it('O3: soft snagging (free) first, then professional from AED 999', () => {
    expect(SNAGGING_OPTIONS.map((o) => [o.type, o.priceFromAed])).toEqual([
      ['soft', null],
      ['professional', 999],
    ]);
    const pro = SNAGGING_OPTIONS[1];
    expect(pro === undefined ? '' : fill(DICTIONARY.en[pro.detail], { price: pro.priceFromAed ?? 0 })).toBe(
      'Independent inspector, from AED 999',
    );
  });

  it('L2: the valuation line is exactly the shared wording in English, and translated everywhere', () => {
    expect(DICTIONARY.en['report.disclaimer']).toBe(VALUATION_DISCLAIMER);
    for (const language of LANGUAGES.filter((l) => l !== 'en')) {
      expect(DICTIONARY[language]['report.disclaimer']).not.toBe(VALUATION_DISCLAIMER);
    }
  });

  it('O3: every report kind and snag status has words', () => {
    expect(DICTIONARY.en[REPORT_TITLE.reinspection]).toBe('Re-inspection report');
    expect(DICTIONARY.en[SNAG_STATUS.fixed]).toBe('Fixed, please check');
  });

  it('O3: the snag counts', () => {
    expect(snagCounts(['open', 'fixed', 'fixed', 'confirmed'])).toEqual({ open: 1, fixed: 2, confirmed: 1 });
    expect(snagCounts([])).toEqual({ open: 0, fixed: 0, confirmed: 0 });
  });

  it('O3: a report appears under the documents of its own unit only', () => {
    const all = [
      report({}),
      report({ id: 'rep-2', unitName: '506-JAD288-C' }),
      report({ id: 'rep-3', unitName: null }),
    ];
    expect(reportsForUnit(all, '1204-J188').map((r) => r.id)).toEqual(['rep-1']);
    expect(reportsForUnit(all, null)).toEqual([]);
  });
});
