/**
 * A one-page PDF saying "SAMPLE" for the demo owner's documents (ADR 0010), so opening a receipt or passport
 * copy can be tried end to end without any real document. Never served in production.
 */

const TEXT_LINES = [
  'SAMPLE DOCUMENT',
  'JAD+ demo data - not a real document.',
  'Real documents come from Salesforce once JAD+ is connected.',
];

/** PDF strings escape backslash and brackets; demo titles are plain text. */
function pdfText(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Builds a valid single-page PDF (with a correct cross-reference table) showing the title and a notice. */
export function samplePdf(title: string): Uint8Array {
  const lines = [title, ...TEXT_LINES];
  const content = lines
    .map(
      (line, i) =>
        `BT /F1 ${i === 0 ? '20' : '12'} Tf 60 ${String(760 - i * 32)} Td (${pdfText(line)}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
