/**
 * Writes the demo company for `run.ts` to load: the reset and data SQL, and every stored photo and PDF with a
 * manifest of where each goes in the local file store. Everything goes under apps/api/.wrangler (git-ignored).
 */
/* eslint-disable security/detect-non-literal-fs-filename -- writes only under the folder run.ts names (apps/api/.wrangler),
   with file names this module makes itself; nothing comes from input. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Company } from './company.js';
import { dataSql, resetSql } from './export.js';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export function writeCompany(c: Company, outDir: string): { rows: number; files: number } {
  const filesDir = join(outDir, 'demo-company-files');
  rmSync(filesDir, { recursive: true, force: true });
  mkdirSync(filesDir, { recursive: true });
  const data = dataSql(c.w.db);
  writeFileSync(join(outDir, 'demo-company.sql'), data);
  writeFileSync(join(outDir, 'demo-company-reset.sql'), resetSql(c.w.db));
  const manifest = [...c.w.objects.entries()].map(([key, object], i) => {
    const file = `${String(i + 1).padStart(4, '0')}.${EXTENSIONS[object.contentType] ?? 'bin'}`;
    writeFileSync(join(filesDir, file), object.bytes);
    return { key, file, contentType: object.contentType };
  });
  writeFileSync(join(filesDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { rows: data.split('\nINSERT ').length - 1, files: manifest.length };
}
