/** On-call gaps on the "Needs action" list (E6, E7). */
import { describe, expect, it } from 'vitest';
import { onCallGaps } from '../src/oncall.js';

describe('onCallGaps (E6, E7)', () => {
  it('E7: an empty rota warns about this week and the next, both people missing', () => {
    // 2026-11-11 is a Wednesday: this week starts on Monday 9 November.
    expect(onCallGaps('2026-11-11', [])).toEqual([
      { week: '2026-11-09', missing: ['first', 'second'] },
      { week: '2026-11-16', missing: ['first', 'second'] },
    ]);
  });

  it('E6: a full week is not listed; a week with one person names the missing place', () => {
    expect(
      onCallGaps('2026-11-11', [
        { week: '2026-11-09', position: 'first' },
        { week: '2026-11-09', position: 'second' },
        { week: '2026-11-16', position: 'first' },
      ]),
    ).toEqual([{ week: '2026-11-16', missing: ['second'] }]);
  });

  it('E7: weeks further ahead are not checked', () => {
    const full = ['2026-11-09', '2026-11-16'].flatMap((week) => [
      { week, position: 'first' as const },
      { week, position: 'second' as const },
    ]);
    expect(onCallGaps('2026-11-15', full)).toEqual([]);
  });
});
