/**
 * The test stand-in for D1 is as strict as real D1 about bound values: a statement whose placeholders need a
 * different number of values than were bound is refused (real D1 answers "Wrong number of parameter bindings";
 * node:sqlite alone would quietly bind NULL and hide the bug).
 */
import { describe, expect, it } from 'vitest';
import { d1, placeholderCount } from './d1.js';
import { migratedDb } from './db.js';

describe('D1 stand-in', () => {
  it('counts placeholders the way SQLite numbers them', () => {
    expect(placeholderCount('SELECT 1')).toBe(0);
    expect(placeholderCount('SELECT ? , ?')).toBe(2);
    expect(placeholderCount('SELECT ?1, ?2, ?1')).toBe(2);
    expect(placeholderCount('SELECT ?3')).toBe(3);
    expect(placeholderCount('SELECT ?2, ?')).toBe(3);
  });

  it('ignores question marks in strings, quoted names and comments', () => {
    expect(placeholderCount('SELECT \'?\', "a?" FROM t -- why?\nWHERE x = ? /* or ?2 */')).toBe(1);
  });

  it('refuses a statement bound with fewer values than it needs, like real D1', async () => {
    const db = d1(migratedDb());
    await expect(db.prepare('SELECT ? AS a, ? AS b').bind(1).first()).rejects.toThrow(
      /Wrong number of parameter bindings/,
    );
    await expect(db.prepare('SELECT ?1 AS a').bind(1, 2).all()).rejects.toThrow(
      /Wrong number of parameter bindings/,
    );
    expect(await db.prepare('SELECT ?1 AS a, ?1 AS b').bind(7).first()).toEqual({ a: 7, b: 7 });
  });
});
