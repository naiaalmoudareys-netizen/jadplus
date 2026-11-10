/**
 * Sorting for console tables: click a column header to sort by it, again to reverse. Empty values (null) always
 * go last, whatever the direction, so "no data yet" never hides the real figures.
 */
export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  readonly key: K;
  readonly dir: SortDir;
}

export type SortValue = string | number | null;

/** The next sort after a click on `key`: the same column reverses; another column starts ascending. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key !== key) return { key, dir: 'asc' };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
}

/** A sorted copy (stable: equal rows keep their order). */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  value: (row: T, key: K) => SortValue,
): T[] {
  const sign = state.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row, state.key) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) {
        if (a.v === b.v) return a.index - b.index;
        return a.v === null ? 1 : -1;
      }
      return compare(a.v, b.v) * sign || a.index - b.index;
    })
    .map(({ row }) => row);
}
