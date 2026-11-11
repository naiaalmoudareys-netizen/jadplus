/**
 * A small seeded random generator (mulberry32) for the demo company, so the same seed always builds the same
 * company: the demo looks the same every time it is rebuilt, and a failing run can be repeated exactly.
 */
export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** A whole number in [min, max]. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function rng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const r: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick from an empty list');
      return item;
    },
  };
  return r;
}
