/**
 * Managed units in the console (ADR 0034; O4): words for arrangements, the statement file name, and the bulk
 * entry of units sold with complimentary management ("unit name, owner email, until YYYY-MM-DD", one per line).
 * The API checks every row again (owner owns the unit, not already managed) and saves all rows or none.
 */
import { BULK_MAX_ROWS, STATEMENT_MAX_BYTES, type ManagedSource } from '@jadplus/shared';
import { dayText } from './format';
import type { Tone } from './format';

export const SOURCE_LABELS: Readonly<Record<ManagedSource, string>> = {
  consultation: 'Property management agreement',
  admin: 'Set by JAD+ Admin',
  complimentary: 'Complimentary management',
};

export const TENANT_LABELS: Readonly<Record<'invited' | 'active' | 'ended' | 'revoked', [string, Tone]>> = {
  invited: ['Tenant invited', 'warn'],
  active: ['Tenant living there', 'good'],
  ended: ['Tenancy ended', 'calm'],
  revoked: ['Tenancy ended early', 'calm'],
};

/** "Since 1 Nov 2026" or "1 Nov 2026 – 31 Oct 2027". */
export function periodText(since: string, until: string | null): string {
  return until === null ? `Since ${dayText(since)}` : `${dayText(since)} – ${dayText(until)}`;
}

/** "jadplus-statement-506-JAD288-C-2026-11.pdf": never a name from the server. */
export function statementFileName(unitName: string | null, month: string): string {
  const unit = (unitName ?? 'unit').replace(/[^A-Za-z0-9-]/g, '');
  return `jadplus-statement-${unit === '' ? 'unit' : unit}-${month.replace(/[^0-9-]/g, '')}.pdf`;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Why the statement cannot be sent yet, or null (the API sniffs the PDF and checks the month again). */
export function statementProblem(
  month: string,
  file: { readonly type: string; readonly size: number } | null,
): string | null {
  if (!MONTH.test(month)) return 'Choose the month of the statement.';
  if (file === null) return 'Choose the statement PDF first.';
  if (file.type !== 'application/pdf') return 'The statement must be a PDF.';
  if (file.size === 0 || file.size > STATEMENT_MAX_BYTES) return 'The statement can be up to 20 MB.';
  return null;
}

export interface BulkRow {
  readonly unitName: string;
  readonly ownerEmail: string;
  readonly until: string;
}

export interface BulkParse {
  readonly rows: readonly BulkRow[];
  /** Line numbers (1-based, counting every line typed) with what is wrong. */
  readonly problems: readonly { readonly row: number; readonly problem: string }[];
}

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Reads the bulk entry: one unit per line, "unit name, owner email, until date" (a comma or a tab between them).
 * Empty lines are skipped. Problems name the line so staff can correct the list before sending it.
 */
export function parseBulkLines(text: string): BulkParse {
  const rows: BulkRow[] = [];
  const problems: { row: number; problem: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const [unitName = '', ownerEmail = '', until = ''] = parts;
    const row = i + 1;
    if (parts.length !== 3) problems.push({ row, problem: 'Write: unit name, owner email, until date.' });
    else if (unitName === '' || unitName.length > 80) problems.push({ row, problem: 'Check the unit name.' });
    else if (!EMAIL.test(ownerEmail)) problems.push({ row, problem: 'Check the owner’s email.' });
    else if (!DATE.test(until)) problems.push({ row, problem: 'Write the until date as YYYY-MM-DD.' });
    else rows.push({ unitName, ownerEmail: ownerEmail.toLowerCase(), until });
  });
  if (rows.length + problems.length === 0) problems.push({ row: 1, problem: 'Add at least one unit.' });
  if (rows.length > BULK_MAX_ROWS) {
    problems.push({ row: 0, problem: `At most ${String(BULK_MAX_ROWS)} units at a time.` });
  }
  return { rows, problems };
}

/**
 * The API numbers rows by their place in the list it received; this maps that back to the typed line numbers.
 */
export function apiRowToLine(text: string, apiRow: number): number {
  let seen = 0;
  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (line.trim() === '') continue;
    seen += 1;
    if (seen === apiRow) return i + 1;
  }
  return apiRow;
}
