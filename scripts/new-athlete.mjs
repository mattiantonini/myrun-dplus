#!/usr/bin/env node
/** Create an athlete folder and register it. Usage: node scripts/new-athlete.mjs <id> "<Full Name>" */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from '../js/data.js';
import { SITE_FILE, athleteDir, athleteFolders, fail, isSlug, readJson, writeJson } from './lib.mjs';

const [id, name] = process.argv.slice(2);
if (!id || !name) fail('Usage: node scripts/new-athlete.mjs <id> "<Full Name>"');
if (!isSlug(id)) fail(`"${id}" is not a kebab-case slug (for example "mario-rossi").`);
const dir = athleteDir(id);
if (existsSync(dir)) fail(`data/athletes/${id} already exists.`);

const color = PALETTE[athleteFolders().length % PALETTE.length];
mkdirSync(join(dir, 'gpx'), { recursive: true });
writeJson(join(dir, 'athlete.json'), { id, name, bio: '', club: '', color, links: {} });
writeJson(join(dir, 'races.json'), []);

const site = existsSync(SITE_FILE) ? readJson(SITE_FILE) : { title: 'my runD+', locale: 'it-IT', defaultAthlete: null, athletes: [] };
site.athletes = [...new Set([...(site.athletes ?? []), id])];
writeJson(SITE_FILE, site);

console.log(`Created data/athletes/${id}/ (athlete.json, races.json, gpx/) and registered "${id}" in site.json.`);
console.log(`Next: edit athlete.json, then add races with: node scripts/new-race.mjs ${id} <gpx-path>`);
