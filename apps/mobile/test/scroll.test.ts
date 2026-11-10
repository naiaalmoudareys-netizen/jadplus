/** Home links open Payments and My unit at the right place (Naya, 10-Nov-2026). */
import { describe, expect, it } from 'vitest';
import { readScrollParams, scrollParams } from '../src/ui/scrollParams.js';

describe('links that land on a section', () => {
  it('reads back the section and the tap time a link sends', () => {
    expect(readScrollParams(scrollParams('documents', 1000))).toEqual({ section: 'documents', at: '1000' });
  });

  it('ignores missing, repeated or unknown params (no scroll)', () => {
    expect(readScrollParams({})).toBeNull();
    expect(readScrollParams({ section: 'documents' })).toBeNull();
    expect(readScrollParams({ section: ['top', 'documents'], at: '1' })).toBeNull();
    expect(readScrollParams({ section: 'settings', at: '1' })).toBeNull();
  });
});
