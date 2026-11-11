/** Where a link opens a tab (scrollTarget.ts). Plain logic, tested without a phone. */
export const SCROLL_SECTIONS = ['top', 'documents', 'construction', 'handover'] as const;
export type ScrollSection = (typeof SCROLL_SECTIONS)[number];

/** Route params for a link that lands on `section` (a fresh `at` makes a repeated tap scroll again). */
export function scrollParams(section: ScrollSection, now: number): { section: ScrollSection; at: string } {
  return { section, at: String(now) };
}

/** Reads the params a link sent; anything unexpected means "no scroll". */
export function readScrollParams(params: {
  section?: string | string[];
  at?: string | string[];
}): { section: ScrollSection; at: string } | null {
  const { section, at } = params;
  if (typeof section !== 'string' || typeof at !== 'string' || at === '') return null;
  const known = SCROLL_SECTIONS.find((s) => s === section);
  return known === undefined ? null : { section: known, at };
}
