#!/usr/bin/env node
/**
 * Validate everything under data/. Usage: node scripts/validate.mjs [--fix]
 * --fix syncs site.json with the athlete folders and fills location.lat/lon from
 * the first GPX point. Exits non-zero when an error is found.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGpx } from '../js/gpx.js';
import { parseHms } from '../js/format.js';
import { STATUSES, TYPES } from '../js/data.js';
import { SITE_FILE, athleteDir, athleteFolders, isSlug, parseArgs, readJson, writeJson } from './lib.mjs';

const fix = parseArgs(process.argv.slice(2)).fix === true;
const counts = { error: 0, warning: 0, fixed: 0 };
const report = (level, scope, message) => { counts[level] += 1; console.log(`${level.toUpperCase().padEnd(7)} [${scope}] ${message}`); };
const isDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text ?? '') && !Number.isNaN(Date.parse(text));
const isLocal = (path) => typeof path === 'string' && !/^[a-z]+:/i.test(path);
const hasTodo = (value) => JSON.stringify(value).includes('TODO');

function load(path, scope) {
  try {
    return readJson(path);
  } catch (error) {
    report('error', scope, `${path}: ${error.code === 'ENOENT' ? 'file is missing' : `invalid JSON (${error.message})`}`);
    return null;
  }
}

function checkSite(folders) {
  const site = load(SITE_FILE, 'site');
  if (!site) return;
  const listed = Array.isArray(site.athletes) ? site.athletes : [];
  const missing = folders.filter((id) => !listed.includes(id));
  const stale = listed.filter((id) => !folders.includes(id));
  if (fix && (missing.length || stale.length)) {
    site.athletes = [...listed.filter((id) => folders.includes(id)), ...missing];
    writeJson(SITE_FILE, site);
    report('fixed', 'site', `site.json athletes synced with the folders: ${site.athletes.join(', ') || '(none)'}`);
  } else {
    for (const id of missing) report('error', 'site', `folder data/athletes/${id} is not listed in site.json (run with --fix)`);
    for (const id of stale) report('error', 'site', `site.json lists "${id}" but data/athletes/${id} does not exist (run with --fix)`);
  }
  if (site.defaultAthlete && !folders.includes(site.defaultAthlete)) report('error', 'site', `defaultAthlete "${site.defaultAthlete}" is not an athlete folder`);
  if (!site.locale) report('warning', 'site', 'site.json has no "locale"; en-GB is used');
}

function checkRanking(race, scope) {
  const r = race.ranking ?? {};
  for (const key of ['overall', 'gender', 'category']) {
    const [rank, total] = [r[key], r[`${key}Total`]];
    for (const [field, value] of [[key, rank], [`${key}Total`, total]]) {
      if (value !== undefined && value !== null && !(Number.isInteger(value) && value > 0)) report('error', scope, `ranking.${field} "${value}" is not a positive integer`);
    }
    if (rank > total) report('error', scope, `ranking.${key} ${rank} is greater than its total ${total}`);
  }
}

function checkRace(race, id, dir, seen) {
  const scope = `${id}/${race.id ?? '?'}`;
  for (const field of ['id', 'name', 'date', 'status']) if (!race[field]) report('error', scope, `required field "${field}" is missing`);
  if (race.id && !isSlug(race.id)) report('error', scope, 'race id must be a kebab-case slug');
  if (seen.has(race.id)) report('error', scope, 'duplicate race id');
  seen.add(race.id);
  if (hasTodo(race)) report('error', scope, 'TODO placeholders are left to fill in');
  if (race.date && !isDate(race.date)) report('error', scope, `date "${race.date}" is not an ISO date (YYYY-MM-DD)`);
  if (race.startTime && Number.isNaN(Date.parse(race.startTime))) report('error', scope, `startTime "${race.startTime}" is not an ISO date-time`);
  if (race.status && !STATUSES.includes(race.status)) report('error', scope, `status "${race.status}" must be one of ${STATUSES.join(' | ')}`);
  if (race.type && !TYPES.includes(race.type)) report('error', scope, `type "${race.type}" must be one of ${TYPES.join(' | ')}`);
  if (race.time && parseHms(race.time) === null) report('error', scope, `time "${race.time}" is not HH:MM:SS`);
  if (race.status === 'finished' && !race.time) report('warning', scope, 'finished race has no time');
  for (const stop of race.aid ?? []) {
    if (stop.time && parseHms(stop.time) === null) report('error', scope, `aid "${stop.name}" time "${stop.time}" is not HH:MM:SS`);
  }
  checkRanking(race, scope);
  for (const photo of race.photos ?? []) {
    if (isLocal(photo.src) && !existsSync(join(dir, photo.src))) report('error', scope, `photo ${photo.src} does not exist`);
  }
  if (!race.gpx || !isLocal(race.gpx)) return false;
  const gpxPath = join(dir, race.gpx);
  if (!existsSync(gpxPath)) return report('error', scope, `gpx ${race.gpx} does not exist`), false;
  try {
    const first = parseGpx(readFileSync(gpxPath, 'utf8')).points[0];
    const loc = race.location ?? {};
    if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) return false;
    if (!fix) return report('warning', scope, 'location.lat/lon missing: the race is not shown on overview maps (run with --fix)'), false;
    race.location = { ...loc, lat: +first.lat.toFixed(5), lon: +first.lon.toFixed(5) };
    report('fixed', scope, `location set to ${race.location.lat}, ${race.location.lon} from the GPX start`);
    return true;
  } catch (error) {
    report('error', scope, `gpx ${race.gpx} does not parse: ${error.message}`);
    return false;
  }
}

function checkAthlete(id, events) {
  const dir = athleteDir(id);
  if (!isSlug(id)) report('error', id, 'folder name must be a kebab-case slug');
  const athlete = load(join(dir, 'athlete.json'), id);
  if (athlete) {
    if (athlete.id !== id) report('error', id, `athlete.json id "${athlete.id}" does not match the folder name`);
    if (!athlete.name) report('error', id, 'athlete.json has no "name"');
    if (athlete.color && !/^#[0-9a-f]{6}$/i.test(athlete.color)) report('error', id, `color "${athlete.color}" must look like #rrggbb`);
    if (athlete.avatar && isLocal(athlete.avatar) && !existsSync(join(dir, athlete.avatar))) report('error', id, `avatar ${athlete.avatar} does not exist`);
  }
  const racesFile = join(dir, 'races.json');
  const races = load(racesFile, id);
  if (!races) return;
  if (!Array.isArray(races)) return void report('error', id, 'races.json must be an array');
  const seen = new Set();
  let changed = false;
  for (const race of races) {
    changed = checkRace(race, id, dir, seen) || changed;
    if (race.event) events.set(race.event, [...(events.get(race.event) ?? []), { id, race }]);
  }
  if (changed) writeJson(racesFile, races);
}

function checkEvents(events) {
  for (const [key, entries] of events) {
    const scope = entries.map((e) => e.id).join(',');
    for (const field of ['date', 'distanceKm']) {
      const values = [...new Set(entries.map((e) => e.race[field]).filter((v) => v !== undefined && v !== null))];
      if (values.length > 1) report('warning', scope, `event "${key}" has different ${field} values across athletes: ${values.join(' vs ')}`);
    }
  }
}

const folders = athleteFolders();
const events = new Map();
checkSite(folders);
for (const id of folders) checkAthlete(id, events);
checkEvents(events);
console.log(`\n${folders.length} athletes checked: ${counts.error} errors, ${counts.warning} warnings${fix ? `, ${counts.fixed} fixed` : ''}.`);
process.exit(counts.error ? 1 : 0);
