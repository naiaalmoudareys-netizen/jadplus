/** Sortable tables: a header cell that sorts by its column, and the hook that keeps the sort. */
import { useState, type ReactNode } from 'react';
import { nextSort, sortRows, type SortState, type SortValue } from '../lib/sort';

export interface Sorted<T, K extends string> {
  readonly rows: T[];
  readonly sort: SortState<K>;
  readonly onSort: (key: K) => void;
}

/** Rows sorted by the column chosen last (starting with `initial`). */
export function useSort<T, K extends string>(
  rows: readonly T[],
  initial: SortState<K>,
  value: (row: T, key: K) => SortValue,
): Sorted<T, K> {
  const [sort, setSort] = useState(initial);
  return {
    rows: sortRows(rows, sort, value),
    sort,
    onSort: (key) => {
      setSort((s) => nextSort(s, key));
    },
  };
}

export function SortHeader<K extends string>({
  label,
  column,
  sorted,
  numeric = false,
}: {
  label: string;
  column: K;
  sorted: Pick<Sorted<unknown, K>, 'sort' | 'onSort'>;
  numeric?: boolean;
}): ReactNode {
  const active = sorted.sort.key === column;
  const dir = active ? sorted.sort.dir : null;
  return (
    <th
      scope="col"
      className={numeric ? 'num' : undefined}
      aria-sort={dir === null ? 'none' : dir === 'asc' ? 'ascending' : 'descending'}
    >
      <button
        type="button"
        className="sort"
        onClick={() => {
          sorted.onSort(column);
        }}
      >
        {label}
        <span className="sort-mark" aria-hidden="true">
          {dir === null ? '' : dir === 'asc' ? ' ▲' : ' ▼'}
        </span>
      </button>
    </th>
  );
}
