/**
 * `pnpm db:demo:company`: builds the demo company (about three months of a running JAD+, all fictional) and puts
 * it in the developer's LOCAL database and LOCAL file store, replacing what is there. Never preview or production:
 * every wrangler command is given --local, and the script refuses to start unless .dev.vars says
 * ENVIRONMENT=local.
 *
 * Steps: 1) generate the company in memory by driving the real API (scripts/company/generate.task.ts), 2) apply
 * any missing migrations, 3) empty every app table, 4) load the company, 5) put every photo and PDF in local R2
 * (through wrangler's local platform proxy, remote bindings off).
 *
 * Options: --persist-to <folder> uses another local state folder (for trying it without touching your own).
 * Run: pnpm db:migrate:local, then pnpm db:demo:company (from the repository folder).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, '.wrangler');
const DATABASE = 'jadplus-preview';

interface ManifestEntry {
  readonly key: string;
  readonly file: string;
  readonly contentType: string;
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`db:demo:company: ${message}\n`);
  process.exit(1);
}

function options(argv: readonly string[]): { persistTo: string | null } {
  let persistTo: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--persist-to' && argv[i + 1] !== undefined) {
      persistTo = resolve(argv[i + 1] ?? '');
      i += 1;
    } else {
      fail(`unknown option "${arg ?? ''}". The only option is --persist-to <folder>.`);
    }
  }
  return { persistTo };
}

/** The ENVIRONMENT line of .dev.vars, without reading or printing any key. */
function environment(): string | null {
  const file = join(ROOT, '.dev.vars');
  if (!existsSync(file)) return null;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('ENVIRONMENT='));
  return line === undefined ? null : line.trim().slice('ENVIRONMENT='.length);
}

function run(command: string, args: readonly string[]): void {
  const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  const result = spawnSync(command, quoted, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) fail(`"${command} ${args.slice(0, 3).join(' ')} ..." failed`);
}

const { persistTo } = options(process.argv.slice(2));
if (environment() !== 'local') fail('apps/api/.dev.vars must say ENVIRONMENT=local. Nothing was changed.');
if (persistTo !== null && !isAbsolute(persistTo)) fail('--persist-to must be a folder path.');
const local = ['--local', ...(persistTo === null ? [] : ['--persist-to', persistTo])];

say('1/5 Building the demo company (about three months of activity)...');
run('pnpm', ['exec', 'vitest', 'run', '--config', 'scripts/company/vitest.config.ts']);
say('2/5 Applying any missing migrations to the local database...');
run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', DATABASE, ...local]);
say('3/5 Emptying the local database (data only; the tables stay)...');
run('pnpm', [
  'exec',
  'wrangler',
  'd1',
  'execute',
  DATABASE,
  ...local,
  '--yes',
  '--file',
  join(OUT, 'demo-company-reset.sql'),
]);
say('4/5 Loading the demo company...');
run('pnpm', [
  'exec',
  'wrangler',
  'd1',
  'execute',
  DATABASE,
  ...local,
  '--yes',
  '--file',
  join(OUT, 'demo-company.sql'),
]);
const manifest = JSON.parse(
  readFileSync(join(OUT, 'demo-company-files', 'manifest.json'), 'utf8'),
) as ManifestEntry[];
say(`5/5 Putting ${String(manifest.length)} demo photos and PDFs in the local file store...`);
// One local Miniflare instance for all files (one wrangler process per file would take minutes). Same state folder
// as the wrangler commands above (<persist-to>/v3); remote bindings are switched off, so nothing leaves the machine.
const proxy = await getPlatformProxy<{ MEDIA: R2Bucket }>({
  configPath: join(ROOT, 'wrangler.toml'),
  persist: { path: join(persistTo ?? join(OUT, 'state'), 'v3') },
  remoteBindings: false,
});
try {
  for (const entry of manifest) {
    // The manifest and its file names were written by output.ts in this run, under .wrangler/.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see above
    const bytes = readFileSync(join(OUT, 'demo-company-files', entry.file));
    await proxy.env.MEDIA.put(entry.key, bytes, { httpMetadata: { contentType: entry.contentType } });
  }
} finally {
  await proxy.dispose();
}
say(
  'Done. Start the API (pnpm --filter @jadplus/api dev) and sign in with a demo account (see apps/console/README.md).',
);
