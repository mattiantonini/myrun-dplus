import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as d from '../js/data.js';

const race = (over = {}) => ({ id: 'r', name: 'Race', date: '2025-06-27', status: 'finished', ...over });
const athlete = (id, races, extra = {}) => d.buildAthlete(id, { id, name: id.toUpperCase(), ...extra }, races);
const fromDisk = async (url) => JSON.parse(readFileSync(new URL(`../${url}`, import.meta.url), 'utf8'));

test('deriveRace computes pace, effort, percentiles, year and paths', () => {
  const a = athlete('mario-rossi', [race({
    id: '2025-lut', course: '80K', distanceKm: 80, elevationGainM: 4600, time: '13:42:10',
    ranking: { overall: 312, overallTotal: 1450, gender: 280, genderTotal: 1200 },
    gpx: 'gpx/2025-lut.gpx', photos: [{ src: 'photos/2025-lut/1.jpg' }, { src: 'https://example.org/2.jpg' }],
  })]);
  const r = a.races[0];
  assert.equal(r.seconds, 49330);
  assert.equal(r.year, 2025);
  assert.equal(r.type, 'ultra');
  assert.equal(r.title, 'Race 80K');
  assert.equal(r.effortKm, 126);
  assert.equal(Math.round(r.pace), 617);
  assert.equal(Math.round(r.effortPace), 392);
  assert.deepEqual(r.pct, { overall: 22, gender: 24, category: null });
  assert.equal(r.gpxUrl, 'data/athletes/mario-rossi/gpx/2025-lut.gpx');
  assert.deepEqual(r.photos.map((p) => p.src), ['data/athletes/mario-rossi/photos/2025-lut/1.jpg', 'https://example.org/2.jpg']);
  assert.equal(r.href, '#/a/mario-rossi/race/2025-lut');
});

test('a race with only the required fields derives without throwing', () => {
  const r = athlete('a', [race()]).races[0];
  assert.equal(r.type, 'other');
  for (const key of ['seconds', 'pace', 'effortPace', 'effortKm', 'gpxUrl', 'coveredKm']) assert.equal(r[key], null, key);
  assert.deepEqual(r.photos, []);
  assert.deepEqual(r.pct, { overall: null, gender: null, category: null });
});

test('inferType uses the explicit type, then distance and climb', () => {
  assert.equal(d.inferType({ type: 'sky', distanceKm: 80 }), 'sky');
  assert.equal(d.inferType({ type: 'bogus', distanceKm: 80 }), 'ultra');
  assert.equal(d.inferType({ distanceKm: 4.2, elevationGainM: 1000 }), 'vk');
  assert.equal(d.inferType({ distanceKm: 5, elevationGainM: 100 }), 'trail');
  assert.equal(d.inferType({ distanceKm: 42 }), 'trail');
  assert.equal(d.inferType({}), 'other');
});

test('DNF counts the distance covered, never a finish time or pace ranking', () => {
  const a = athlete('a', [
    race({ id: 'x', distanceKm: 60, elevationGainM: 3000, status: 'dnf', dnfAtKm: 38, time: '07:00:00', location: { country: 'CH' } }),
    race({ id: 'y', date: '2024-05-01', distanceKm: 20, elevationGainM: 1000, time: '02:00:00', location: { country: 'IT' } }),
    race({ id: 'z', date: '2024-06-01', distanceKm: 30, status: 'dns' }),
  ]);
  assert.deepEqual(
    { ...a.totals, latest: a.totals.latest.id },
    { races: 3, finishes: 1, dnfs: 1, km: 58, gainM: 1000, seconds: 32400, countries: ['CH', 'IT'], latest: 'x' },
  );
  assert.equal(a.races[0].effortPace, null);
  assert.deepEqual(d.sortRaces(a.races, 'time', 'asc').map((r) => r.id), ['y', 'x', 'z']);
  assert.deepEqual([...d.perYear(a.races)], [[2024, { km: 20, gainM: 1000, races: 2 }], [2025, { km: 38, gainM: 0, races: 1 }]]);
});

test('sortRaces keeps missing values last in both directions', () => {
  const a = athlete('a', [race({ id: 'a', distanceKm: 10 }), race({ id: 'b' }), race({ id: 'c', distanceKm: 30 })]);
  assert.deepEqual(d.sortRaces(a.races, 'km', 'asc').map((r) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(d.sortRaces(a.races, 'km', 'desc').map((r) => r.id), ['c', 'a', 'b']);
});

test('filterRaces combines text and facets; facets list what exists', () => {
  const a = athlete('a', [
    race({ id: 'a', name: 'Lavaredo', distanceKm: 80, location: { place: 'Cortina', country: 'IT' }, tags: ['dolomites'] }),
    race({ id: 'b', name: 'Sierre-Zinal', date: '2024-08-10', distanceKm: 31, location: { country: 'CH' }, status: 'dnf' }),
  ]);
  const ids = (filters) => d.filterRaces(a.races, filters).map((r) => r.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ q: 'DOLOM' }), ['a']);
  assert.deepEqual(ids({ q: 'cortina', country: 'CH' }), []);
  assert.deepEqual(ids({ year: '2024' }), ['b']);
  assert.deepEqual(ids({ type: 'ultra', status: 'finished' }), ['a']);
  assert.deepEqual(ids({ athlete: 'someone-else' }), []);
  assert.deepEqual(d.facets(a.races), { year: [2025, 2024], type: ['trail', 'ultra'], country: ['CH', 'IT'], status: ['finished', 'dnf'] });
});

test('personalBests picks the best finished race per type', () => {
  const a = athlete('a', [
    race({ id: 'slow', distanceKm: 20, elevationGainM: 1000, time: '03:00:00', ranking: { overall: 50, overallTotal: 100 } }),
    race({ id: 'fast', distanceKm: 30, elevationGainM: 1000, time: '03:00:00', ranking: { overall: 80, overallTotal: 100 } }),
    race({ id: 'dnf', distanceKm: 40, status: 'dnf' }),
  ]);
  const [pb] = d.personalBests(a.races);
  assert.deepEqual([pb.type, pb.count, pb.fastest.id, pb.longest.id, pb.bestRank.id], ['trail', 2, 'fast', 'fast', 'slow']);
});

test('loadData reports a broken athlete folder without losing the others', async () => {
  const files = {
    'data/site.json': { locale: 'it-IT', athletes: ['a', 'ghost', 'b'] },
    'data/athletes/a/athlete.json': { id: 'a', name: 'A' },
    'data/athletes/a/races.json': [race({ id: 'a1', event: 'e', time: '02:00:00' }), race({ id: 'a2', event: 'solo', date: '2024-01-01' })],
    'data/athletes/b/athlete.json': { id: 'b', name: 'B', color: '#123456' },
    'data/athletes/b/races.json': [race({ id: 'b1', event: 'e', time: '01:50:00' })],
  };
  const data = await d.loadData(async (url) => {
    if (!(url in files)) throw new Error(`${url}: HTTP 404`);
    return files[url];
  });
  assert.deepEqual(data.athletes.map((a) => a.id), ['a', 'b']);
  assert.deepEqual(data.errors.map((e) => [e.id, e.error.message]), [['ghost', 'data/athletes/ghost/athlete.json: HTTP 404']]);
  assert.equal(data.athletes[0].color, d.PALETTE[0]);
  assert.equal(data.athletes[1].color, '#123456');
  assert.equal(data.site.title, 'my runD+');
  assert.deepEqual(data.races.map((r) => [r.id, r.shared]), [['a1', true], ['b1', true], ['a2', false]]);
  assert.deepEqual(data.events.get('e').map((r) => r.id), ['b1', 'a1']);
  assert.deepEqual(d.sharedEvents(data.events).map((e) => [e.key, e.href]), [['e', '#/event/e']]);
  assert.equal(data.athlete('b').name, 'B');
  assert.equal(data.athlete('ghost'), null);
});

test('headToHead counts wins and gaps on shared events only', async () => {
  const mk = (id, races) => athlete(id, races).races;
  const races = [
    ...mk('a', [race({ id: '1', event: 'e1', time: '02:00:00' }), race({ id: '2', event: 'e2', time: '05:00:00' }), race({ id: '3', event: 'e3', status: 'dnf' })]),
    ...mk('b', [race({ id: '1', event: 'e1', time: '02:10:00' }), race({ id: '2', event: 'e2', time: '04:30:00' }), race({ id: '3', event: 'e3', time: '09:00:00' })]),
    ...mk('c', [race({ id: '1', event: 'e1', time: '01:00:00' }), race({ id: '9', event: 'only-c', time: '01:00:00' })]),
  ];
  const { rows, wins } = d.headToHead(['a', 'b'], d.groupEvents(races));
  assert.deepEqual(Object.fromEntries(wins), { a: 1, b: 2 });
  assert.deepEqual(rows.map((r) => [r.key, r.winner.athlete.id, r.gapS]).sort(), [['e1', 'a', 600], ['e2', 'b', 1800], ['e3', 'b', null]]);
});

test('the sample data loads and links its shared events', async () => {
  const data = await d.loadData(fromDisk);
  assert.equal(data.errors.length, 0);
  assert.equal(data.athletes.length, 2);
  assert.ok(data.races.every((r) => r.tags?.includes('sample')));
  assert.ok(d.sharedEvents(data.events).length >= 1);
});
