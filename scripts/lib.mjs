/** Shared helpers for the maintenance scripts (Node built-ins only). */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The data folder; MYRUN_DATA_DIR overrides it (used to try scripts on a copy). */
export const DATA_DIR = process.env.MYRUN_DATA_DIR ?? join(fileURLToPath(new URL('..', import.meta.url)), 'data');
export const SITE_FILE = join(DATA_DIR, 'site.json');
export const athleteDir = (id) => join(DATA_DIR, 'athletes', id);
export const isSlug = (text) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text ?? '');

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/** Names of the folders under data/athletes, sorted. */
export function athleteFolders() {
  const dir = join(DATA_DIR, 'athletes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** Split argv into positional arguments and `--name value` / `--flag` options. */
export function parseArgs(argv, valueOptions = []) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) args._.push(arg);
    else if (valueOptions.includes(arg.slice(2))) args[arg.slice(2)] = argv[++i];
    else args[arg.slice(2)] = true;
  }
  return args;
}

/** Print a message and exit with an error code. */
export function fail(message) {
  console.error(message);
  process.exit(1);
}
