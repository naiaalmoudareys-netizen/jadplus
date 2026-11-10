/**
 * A partner's documents on JAD+ Admin's partner list (S7, P3): red when lapsed or missing, amber within 30 days
 * of expiry. The standing itself is the shared rule (packages/shared/src/scorecard.ts).
 */
import { documentStanding, dubaiDate, type DocumentStanding } from '@jadplus/shared';
import { dayText, type Tone } from './format';

const KIND_LABELS: Readonly<Record<string, string>> = {
  licence: 'Trade licence',
  insurance: 'Insurance',
};

export interface DocumentLine {
  readonly label: string;
  readonly standing: DocumentStanding;
  readonly tone: Tone;
  readonly text: string;
}

const TONES: Readonly<Record<DocumentStanding, Tone>> = {
  valid: 'good',
  expiring_soon: 'warn',
  lapsed: 'bad',
  missing: 'bad',
};

/** One document as a line: "Insurance · expired 3 Nov 2026" in red. */
export function documentLine(doc: { kind: string; expiresOn: string | null }, now: number): DocumentLine {
  const standing = documentStanding(doc.expiresOn, dubaiDate(now));
  const label = KIND_LABELS[doc.kind] ?? doc.kind;
  const date = doc.expiresOn === null ? '' : dayText(doc.expiresOn);
  const text =
    standing === 'missing' ? 'not on file' : standing === 'lapsed' ? `expired ${date}` : `expires ${date}`;
  return { label, standing, tone: TONES[standing], text };
}

/** The trade licence and insurance always show, even when nothing is on file. */
export function documentLines(
  docs: readonly { kind: string; expiresOn: string | null }[],
  now: number,
): DocumentLine[] {
  const required = ['licence', 'insurance'].filter((k) => !docs.some((d) => d.kind === k));
  return [...docs, ...required.map((kind) => ({ kind, expiresOn: null }))].map((d) => documentLine(d, now));
}
