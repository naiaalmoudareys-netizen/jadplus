/**
 * A partner's documents on JAD+ Admin's partner list (S7, P3): red when lapsed or missing, amber within 30 days
 * of expiry. The standing itself is the shared rule (packages/shared/src/scorecard.ts).
 */
import {
  REQUIRED_PARTNER_DOCUMENTS,
  dubaiDate,
  partnerDocumentLabel,
  partnerDocumentStanding,
  type DocumentStanding,
} from '@jadplus/shared';
import { dayText, type Tone } from './format';

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

/** One document as a line: "Insurance · expired 3 Nov 2026" in red; `null` expiry on file is valid (S10). */
export function documentLine(
  doc: { kind: string; expiresOn: string | null; onFile?: boolean },
  now: number,
): DocumentLine {
  const standing = partnerDocumentStanding(doc.onFile === false ? null : doc, dubaiDate(now));
  const label = partnerDocumentLabel(doc.kind);
  const date = doc.expiresOn === null ? '' : dayText(doc.expiresOn);
  const text =
    standing === 'missing'
      ? 'not on file'
      : standing === 'lapsed'
        ? `expired ${date}`
        : date === ''
          ? 'on file'
          : `expires ${date}`;
  return { label, standing, tone: TONES[standing], text };
}

/** The trade licence and insurance always show, even when nothing is on file. */
export function documentLines(
  docs: readonly { kind: string; expiresOn: string | null }[],
  now: number,
): DocumentLine[] {
  const required = REQUIRED_PARTNER_DOCUMENTS.filter((k) => !docs.some((d) => d.kind === k));
  return [...docs, ...required.map((kind) => ({ kind, expiresOn: null, onFile: false }))].map((d) =>
    documentLine(d, now),
  );
}
