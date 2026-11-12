import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../js/gpx.js';

const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
const T0 = Date.parse('2025-07-12T05:00:00Z');
/** Straight track heading north: `n` points, `stepKm` apart, `stepS` seconds apart. */
const line = (n, { stepKm = 0.1, stepS = 60, ele = (i) => 1000 + i * 10 } = {}) => g.buildTrack(Array.from({ length: n }, (_, i) => ({
  lat: 46 + (i * stepKm) / 111.195, lon: 11, ele: ele(i), time: T0 + i * stepS * 1000,
})));

test('haversine matches known distances', () => {
  near(g.haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 111.195, 0.01);
  near(g.haversine({ lat: 46.5405, lon: 12.1357 }, { lat: 46.0207, lon: 7.7491 }), 342, 3); // Cortina → Zermatt
  assert.equal(g.haversine({ lat: 46, lon: 11 }, { lat: 46, lon: 11 }), 0);
});

test('parseGpx reads trkpt with elevation, time and gpxtpx:hr', () => {
  const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="x"><trk><trkseg>
    <trkpt lat="46.0" lon="11.0"><ele>1000</ele><time>2025-07-12T05:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lon='11.0' lat='46.009'><ele>1100.5</ele><time>2025-07-12T05:10:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk></gpx>`;
  const track = g.parseGpx(xml);
  assert.equal(track.points.length, 2);
  assert.deepEqual(track.points[0], { lat: 46, lon: 11, ele: 1000, time: T0, hr: 140, dist: 0 });
  near(track.distanceKm, 1.0, 0.01);
  assert.equal(track.elapsedS, 600);
  assert.equal(track.avgHr, 150);
  assert.equal(track.maxEle, 1100.5);
  assert.equal(track.startTime, T0);
});

test('parseGpx falls back to rtept and tolerates missing elevation and time', () => {
  const track = g.parseGpx('<gpx><rte><rtept lat="46.0" lon="11.0"/><rtept lat="46.01" lon="11.0"></rtept></rte></gpx>');
  assert.equal(track.points.length, 2);
  assert.equal(track.points[1].ele, null);
  for (const key of ['gainM', 'lossM', 'maxEle', 'startTime', 'elapsedS', 'movingS', 'avgHr']) assert.equal(track[key], null, key);
  assert.equal(g.timeAtDistance(track, 0.5), null);
  assert.deepEqual(g.splits(track, 1), []);
  near(g.pointAtDistance(track, track.distanceKm / 2).lat, 46.005, 1e-6);
});

test('parseGpx rejects files without points or that are not GPX', () => {
  assert.throws(() => g.parseGpx('<gpx><trk><trkseg></trkseg></trk></gpx>'), /no track or route points/);
  assert.throws(() => g.parseGpx('not xml at all'), /not valid XML/);
});

test('elevation gain ignores GPS noise but keeps real climbs', () => {
  const noisy = Array.from({ length: 400 }, (_, i) => 1500 + (i % 2 ? 1.2 : -1.2));
  const flat = g.elevationGain(noisy);
  assert.ok(flat.gain < 5 && flat.loss < 5, `noise produced ${flat.gain} m`);
  const hill = Array.from({ length: 201 }, (_, i) => 1000 + (i <= 100 ? i * 5 : (200 - i) * 5) + (i % 2 ? 1 : -1));
  const climb = g.elevationGain(hill);
  near(climb.gain, 500, 15);
  near(climb.loss, 500, 15);
  assert.deepEqual(g.elevationGain([1000, 1001, 1002]), { gain: 0, loss: 0 });
});

test('track stats: distance, elapsed, moving and stopped time', () => {
  const track = line(11);
  near(track.distanceKm, 1.0, 0.001);
  assert.equal(track.elapsedS, 600);
  assert.equal(track.movingS, 600);
  assert.equal(track.stoppedS, 0);
  near(track.gainM, 100, 3);
  const points = line(11).points.map((p) => ({ ...p }));
  points.splice(6, 0, { ...points[5], time: points[5].time + 30000 }); // 30 s standing still
  const paused = g.buildTrack(points);
  assert.equal(paused.stoppedS, 30);
  assert.equal(paused.movingS, 570);
});

test('timeAtDistance and pointAtDistance interpolate and clamp', () => {
  const track = line(11);
  near(g.timeAtDistance(track, 0.55), 330, 0.5);
  assert.equal(g.timeAtDistance(track, 0), 0);
  near(g.timeAtDistance(track, track.distanceKm), 600, 1e-6);
  assert.equal(g.timeAtDistance(track, 5), null);
  assert.equal(g.timeAtDistance(track, -1), null);
  near(g.pointAtDistance(track, 0.25).ele, 1025, 0.1);
  assert.equal(g.pointAtDistance(track, 99), track.points.at(-1));
  assert.equal(g.pointAtDistance(track, -1), track.points[0]);
});

test('downsample keeps the ends and the limit; stats stay full resolution', () => {
  const track = line(5001, { stepKm: 0.01, stepS: 5, ele: () => 1000 });
  const thin = g.downsample(track.points);
  assert.equal(thin.length, 2000);
  assert.equal(thin[0], track.points[0]);
  assert.equal(thin.at(-1), track.points.at(-1));
  assert.equal(g.downsample(track.points.slice(0, 10)).length, 10);
  near(track.distanceKm, 50, 0.01);
});

test('splits cover the whole track, with a shorter last one', () => {
  const track = line(26); // 2.5 km, 6:00 per 100 m... 10 min/km
  const rows = g.splits(track, 1);
  assert.equal(rows.length, 3);
  near(rows[0].splitS, 600, 1);
  near(rows[0].eleDiffM, 100, 1);
  near(rows[2].lengthKm, 0.5, 0.001);
  near(rows[2].elapsedS, 1500, 1e-6);
  near(rows.reduce((sum, r) => sum + r.splitS, 0), track.elapsedS, 1e-6);
});

test('nearestIndex finds the closest point', () => {
  const track = line(11);
  assert.equal(g.nearestIndex(track.points, { lat: track.points[7].lat + 0.00001, lon: 11.0001 }), 7);
});

test('sample GPX files parse to plausible Alpine tracks', () => {
  const xml = readFileSync(new URL('../data/athletes/sample-runner-a/gpx/2025-valfinta-sky-race-32k.gpx', import.meta.url), 'utf8');
  const track = g.parseGpx(xml);
  near(track.distanceKm, 32, 0.5);
  near(track.gainM, 2250, 150);
  near(track.elapsedS, 4 * 3600 + 52 * 60 + 18, 2);
  assert.ok(track.stoppedS > 60 && track.avgHr > 100);
});
