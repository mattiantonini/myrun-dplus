/**
 * Pure GPX parsing and track maths. Uses the native DOMParser in the browser and a
 * tiny regex reader where DOMParser does not exist (Node scripts and tests).
 *
 * @typedef {{lat:number, lon:number, ele:number|null, time:number|null, hr:number|null, dist:number}} TrackPoint
 * @typedef {{points:TrackPoint[], distanceKm:number, gainM:number|null, lossM:number|null,
 *   minEle:number|null, maxEle:number|null, startTime:number|null, elapsedS:number|null,
 *   movingS:number|null, stoppedS:number|null, avgHr:number|null}} Track
 */

const EARTH_RADIUS_KM = 6371.0088;
const STOPPED_BELOW_MS = 0.15; // metres per second
const num = (text) => (text === null || text === undefined || text === '' || Number.isNaN(+text) ? null : +text);
const stamp = (text) => { const t = Date.parse(text ?? ''); return Number.isNaN(t) ? null : t; };

/** Great-circle distance in km between two {lat, lon} points. */
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function readWithDom(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX is not valid XML');
  const pick = (tag) => [...doc.getElementsByTagNameNS('*', tag)];
  const child = (el, tag) => el.getElementsByTagNameNS('*', tag)[0]?.textContent;
  const nodes = pick('trkpt').length ? pick('trkpt') : pick('rtept');
  return nodes.map((el) => ({
    lat: el.getAttribute('lat'), lon: el.getAttribute('lon'),
    ele: child(el, 'ele'), time: child(el, 'time'), hr: child(el, 'hr'),
  }));
}

function readWithRegex(xml) {
  if (!/<gpx[\s>]/.test(xml) || !/<\/gpx>\s*$/.test(xml)) throw new Error('GPX is not valid XML');
  const tag = xml.includes('<trkpt') ? 'trkpt' : 'rtept';
  const attr = (head, name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(head)?.[1];
  const child = (body, name) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)<`).exec(body)?.[1];
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  return [...xml.matchAll(re)].map(([, head, body = '']) => ({
    lat: attr(head, 'lat'), lon: attr(head, 'lon'),
    ele: child(body, 'ele'), time: child(body, 'time'), hr: child(body, 'hr'),
  }));
}

/**
 * Parse GPX text into a track with cumulative distance and full-resolution stats.
 * Reads `trkpt` and falls back to `rtept`; elevation, time and heart rate are optional.
 * @param {string} xml
 * @returns {Track}
 */
export function parseGpx(xml) {
  const raw = typeof DOMParser === 'undefined' ? readWithRegex(xml) : readWithDom(xml);
  const points = raw
    .map((p) => ({ lat: num(p.lat), lon: num(p.lon), ele: num(p.ele), time: stamp(p.time), hr: num(p.hr) }))
    .filter((p) => p.lat !== null && p.lon !== null);
  if (!points.length) throw new Error('GPX has no track or route points');
  return buildTrack(points);
}

/**
 * Add cumulative distance (km) to raw points and compute track statistics.
 * @param {{lat:number, lon:number, ele?:number|null, time?:number|null, hr?:number|null}[]} raw
 * @returns {Track}
 */
export function buildTrack(raw) {
  let dist = 0;
  const points = raw.map((p, i) => {
    if (i) dist += haversine(raw[i - 1], p);
    return { lat: p.lat, lon: p.lon, ele: p.ele ?? null, time: p.time ?? null, hr: p.hr ?? null, dist };
  });
  const eles = points.map((p) => p.ele).filter((e) => e !== null);
  const timed = points.filter((p) => p.time !== null);
  const hrs = points.map((p) => p.hr).filter((h) => h !== null);
  const climb = eles.length > 1 ? elevationGain(eles) : null;
  const moving = timed.length > 1 ? movingTime(timed) : null;
  return {
    points,
    distanceKm: dist,
    gainM: climb?.gain ?? null,
    lossM: climb?.loss ?? null,
    minEle: eles.length ? Math.min(...eles) : null,
    maxEle: eles.length ? Math.max(...eles) : null,
    startTime: timed[0]?.time ?? null,
    elapsedS: moving ? (timed.at(-1).time - timed[0].time) / 1000 : null,
    movingS: moving?.moving ?? null,
    stoppedS: moving?.stopped ?? null,
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
  };
}

/** Centred moving average over `window` samples; the window shrinks near the ends so they keep their value. */
export function smooth(values, window = 5) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const reach = Math.min(half, i, values.length - 1 - i);
    const slice = values.slice(i - reach, i + reach + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * Total ascent and descent in metres. A moving average plus a hysteresis threshold
 * keeps GPS noise from inflating the totals.
 * @param {number[]} elevations
 * @param {{window?:number, threshold?:number}} [options]
 * @returns {{gain:number, loss:number}}
 */
export function elevationGain(elevations, { window = 5, threshold = 3 } = {}) {
  const eles = smooth(elevations, window);
  let gain = 0;
  let loss = 0;
  let ref = eles[0];
  for (const ele of eles) {
    const delta = ele - ref;
    if (Math.abs(delta) < threshold) continue;
    if (delta > 0) gain += delta; else loss -= delta;
    ref = ele;
  }
  return { gain, loss };
}

function movingTime(timed) {
  let moving = 0;
  let stopped = 0;
  for (let i = 1; i < timed.length; i++) {
    const dt = (timed[i].time - timed[i - 1].time) / 1000;
    if (dt <= 0) continue;
    const speed = ((timed[i].dist - timed[i - 1].dist) * 1000) / dt;
    if (speed < STOPPED_BELOW_MS) stopped += dt; else moving += dt;
  }
  return { moving, stopped };
}

/**
 * Interpolated point at a cumulative distance (clamped to the track).
 * @param {Track} track
 * @param {number} km
 * @returns {TrackPoint}
 */
export function pointAtDistance(track, km) {
  const pts = track.points;
  if (km <= 0 || pts.length === 1) return pts[0];
  if (km >= track.distanceKm) return pts.at(-1);
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].dist <= km) lo = mid; else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const f = b.dist > a.dist ? (km - a.dist) / (b.dist - a.dist) : 0;
  const mix = (key) => (a[key] === null || b[key] === null ? a[key] ?? b[key] : a[key] + (b[key] - a[key]) * f);
  return { lat: mix('lat'), lon: mix('lon'), ele: mix('ele'), time: mix('time'), hr: mix('hr'), dist: km };
}

/**
 * Seconds elapsed since the start when the track reaches `km`; null when the track
 * has no timestamps or is shorter than `km`.
 */
export function timeAtDistance(track, km) {
  if (track.startTime === null || km < 0 || km > track.distanceKm + 1e-6) return null;
  const time = pointAtDistance(track, km).time;
  return time === null ? null : (time - track.startTime) / 1000;
}

/** Index of the track point closest to a {lat, lon} position. */
export function nearestIndex(points, pos) {
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = (p.lat - pos.lat) ** 2 + ((p.lon - pos.lon) * Math.cos((pos.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Evenly thin points for rendering, always keeping the first and last one. */
export function downsample(points, max = 2000) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Splits every `stepKm` from GPX timestamps (the last one may be shorter).
 * @returns {{km:number, lengthKm:number, splitS:number, elapsedS:number, eleDiffM:number|null}[]}
 */
export function splits(track, stepKm) {
  if (track.startTime === null || !(stepKm > 0)) return [];
  const rows = [];
  let prev = { km: 0, elapsedS: 0, ele: track.points[0].ele };
  const marks = [];
  for (let km = stepKm; km < track.distanceKm - 0.05; km += stepKm) marks.push(km);
  for (const km of [...marks, track.distanceKm]) {
    const p = pointAtDistance(track, km);
    if (p.time === null) continue;
    const elapsedS = (p.time - track.startTime) / 1000;
    const eleDiffM = p.ele === null || prev.ele === null ? null : p.ele - prev.ele;
    rows.push({ km, lengthKm: km - prev.km, splitS: elapsedS - prev.elapsedS, elapsedS, eleDiffM });
    prev = { km, elapsedS, ele: p.ele };
  }
  return rows;
}
