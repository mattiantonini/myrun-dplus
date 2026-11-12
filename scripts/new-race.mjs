#!/usr/bin/env node
/**
 * Add a race from a GPX file.
 * Usage: node scripts/new-race.mjs <athlete-id> <gpx-path> [--id <slug>] [--event <key>]
 * Copies the GPX into the athlete folder and appends a pre-filled races.json entry
 * with TODO placeholders for what a GPX cannot know.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { haversine, parseGpx } from '../js/gpx.js';
import { formatDuration, slugify } from '../js/format.js';
import { athleteDir, athleteFolders, fail, isSlug, parseArgs, readJson, writeJson } from './lib.mjs';

const NEARBY_KM = 5;
const args = parseArgs(process.argv.slice(2), ['id', 'event']);
const [athleteId, gpxPath] = args._;
if (!athleteId || !gpxPath) fail('Usage: node scripts/new-race.mjs <athlete-id> <gpx-path> [--id <slug>] [--event <key>]');
const dir = athleteDir(athleteId);
if (!existsSync(join(dir, 'races.json'))) fail(`Athlete "${athleteId}" does not exist. Create it with scripts/new-athlete.mjs first.`);
if (!existsSync(gpxPath)) fail(`GPX file not found: ${gpxPath}`);

const track = parseGpx(readFileSync(gpxPath, 'utf8'));
const start = track.points[0];
const date = track.startTime === null ? null : new Date(track.startTime).toISOString().slice(0, 10);
const fileSlug = slugify(basename(gpxPath).replace(/\.gpx$/i, ''));
const id = args.id ?? (/^\d{4}-/.test(fileSlug) || !date ? fileSlug : `${date.slice(0, 4)}-${fileSlug}`);
if (!isSlug(id)) fail(`"${id}" is not a kebab-case slug; pass one with --id.`);
const races = readJson(join(dir, 'races.json'));
if (races.some((race) => race.id === id)) fail(`Race id "${id}" already exists for ${athleteId}; pass another with --id.`);

/** First race of another athlete that satisfies `matches`, with the athlete id. */
function findTeammateRace(matches) {
  for (const other of athleteFolders().filter((folder) => folder !== athleteId)) {
    const file = join(athleteDir(other), 'races.json');
    const match = existsSync(file) ? readJson(file).find((race) => race.event && matches(race)) : null;
    if (match) return { other, match };
  }
  return null;
}

const linked = args.event ? findTeammateRace((race) => race.event === args.event) : null;
const suggestion = args.event ? null : findTeammateRace((race) => race.date === date
  && Number.isFinite(race.location?.lat) && haversine(start, race.location) <= NEARBY_KM);
const template = (linked ?? suggestion)?.match ?? {};
const entry = {
  id,
  ...(args.event ? { event: args.event } : {}),
  name: template.name ?? 'TODO race name',
  ...(template.edition ? { edition: template.edition } : {}),
  ...(template.course ? { course: template.course } : {}),
  date: date ?? 'TODO YYYY-MM-DD',
  location: { place: template.location?.place ?? 'TODO place', country: template.location?.country ?? 'TODO',
    lat: +start.lat.toFixed(5), lon: +start.lon.toFixed(5) },
  distanceKm: template.distanceKm ?? +track.distanceKm.toFixed(1),
  ...(track.gainM === null ? {} : { elevationGainM: template.elevationGainM ?? Math.round(track.gainM), elevationLossM: template.elevationLossM ?? Math.round(track.lossM) }),
  status: 'TODO finished | dnf | dns | dq',
  time: track.elapsedS === null ? 'TODO HH:MM:SS' : formatDuration(track.elapsedS).padStart(8, '0'),
  ranking: { overall: 'TODO', overallTotal: 'TODO' },
  notes: '',
  gpx: `gpx/${id}.gpx`,
};

mkdirSync(join(dir, 'gpx'), { recursive: true });
copyFileSync(gpxPath, join(dir, entry.gpx));
writeJson(join(dir, 'races.json'), [...races, entry]);

console.log(`Added "${id}" to data/athletes/${athleteId}/races.json and copied the GPX to ${entry.gpx}.`);
console.log(`From the GPX: ${date ?? 'no date'}, ${track.distanceKm.toFixed(1)} km, ${track.gainM === null ? 'no elevation' : `${Math.round(track.gainM)} m D+`}, ${track.elapsedS === null ? 'no timestamps' : formatDuration(track.elapsedS)} elapsed.`);
if (linked) console.log(`Linked to ${linked.other}'s "${linked.match.name}"; name, course, place and official distance were copied from it.`);
if (suggestion) {
  console.log(`\nLooks like the same race as ${suggestion.other}'s "${suggestion.match.name}" (same date, start within ${NEARBY_KM} km).`);
  console.log(`Name, course, place and official distance were copied from it. To link them, add to the new entry:  "event": "${suggestion.match.event}"`);
}
console.log('\nNext: replace every TODO in the entry (the GPS time is a placeholder for the official time), then run: node scripts/validate.mjs');
