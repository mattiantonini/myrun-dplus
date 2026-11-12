/** Loading of `data/` and every value derived from it (derived values are never stored). */
import { parseHms, percentile } from './format.js';

export const TYPES = ['vk', 'sky', 'trail', 'ultra', 'other'];
export const STATUSES = ['finished', 'dnf', 'dns', 'dq'];
/** Colours auto-assigned to athletes without a `color`, in fixed order. */
export const PALETTE = ['#eb6834', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

const isNum = Number.isFinite;
const sum = (list, pick) => list.reduce((total, item) => total + (pick(item) ?? 0), 0);
const resolve = (base, path) => (!path || /^[a-z]+:/i.test(path) ? path ?? null : base + path);

/** Race type from the `type` field, or inferred from distance and climb. */
export function inferType(race) {
  if (TYPES.includes(race.type)) return race.type;
  const km = race.distanceKm;
  if (!isNum(km)) return 'other';
  if (km <= 8 && race.elevationGainM / km >= 120) return 'vk';
  return km > 42.5 ? 'ultra' : 'trail';
}

/**
 * Add derived fields to a raw race entry: seconds, pace, effort, percentiles, type,
 * year, resolved asset URLs and its link.
 * @param {object} race raw entry from races.json
 * @param {object} athlete owning athlete (needs `id` and `base`)
 */
export function deriveRace(race, athlete) {
  const finished = race.status === 'finished';
  const seconds = parseHms(race.time);
  const coveredKm = finished ? race.distanceKm : race.status === 'dnf' ? race.dnfAtKm : null;
  const effortKm = isNum(race.distanceKm) ? race.distanceKm + (race.elevationGainM ?? 0) / 100 : null;
  const rank = race.ranking ?? {};
  return {
    ...race,
    athlete,
    href: `#/a/${athlete.id}/race/${race.id}`,
    title: [race.name ?? race.id, race.course].filter(Boolean).join(' '),
    year: Number(String(race.date).slice(0, 4)) || null,
    type: inferType(race),
    finished,
    seconds,
    coveredKm: isNum(coveredKm) ? coveredKm : null,
    effortKm,
    pace: seconds && coveredKm > 0 ? seconds / coveredKm : null,
    effortPace: finished && seconds && effortKm > 0 ? seconds / effortKm : null,
    pct: {
      overall: percentile(rank.overall, rank.overallTotal),
      gender: percentile(rank.gender, rank.genderTotal),
      category: percentile(rank.category, rank.categoryTotal),
    },
    gpxUrl: resolve(athlete.base, race.gpx),
    photos: (race.photos ?? []).map((p) => ({ ...p, src: resolve(athlete.base, p.src) })),
    shared: false,
  };
}

/** Totals over a list of derived races. */
export function summarize(races) {
  const finishes = races.filter((r) => r.finished);
  return {
    races: races.length,
    finishes: finishes.length,
    dnfs: races.filter((r) => r.status === 'dnf').length,
    km: sum(races, (r) => r.coveredKm),
    gainM: sum(finishes, (r) => r.elevationGainM),
    seconds: sum(races, (r) => r.seconds),
    countries: [...new Set(races.map((r) => r.location?.country).filter(Boolean))].sort(),
    latest: [...races].sort(compare('date', -1))[0] ?? null,
  };
}

/** Build an athlete with derived races from the two raw JSON files. */
export function buildAthlete(id, athlete, races, index = 0) {
  const base = `data/athletes/${id}/`;
  const built = {
    ...athlete,
    id,
    name: athlete.name ?? id,
    color: athlete.color ?? PALETTE[index % PALETTE.length],
    base,
    avatarUrl: resolve(base, athlete.avatar),
    href: `#/a/${id}`,
  };
  built.races = (Array.isArray(races) ? races : []).map((r) => deriveRace(r, built)).sort(compare('date', -1));
  built.totals = summarize(built.races);
  return built;
}

/**
 * Load site.json, then every athlete.json and races.json in parallel. An athlete
 * whose files fail to load is reported in `errors` and never breaks the others.
 * @param {(url:string) => Promise<any>} fetchJson
 */
export async function loadData(fetchJson) {
  const site = await fetchJson('data/site.json');
  const ids = Array.isArray(site.athletes) ? site.athletes : [];
  const loaded = await Promise.all(ids.map(async (id, index) => {
    const base = `data/athletes/${id}/`;
    try {
      const [athlete, races] = await Promise.all([fetchJson(`${base}athlete.json`), fetchJson(`${base}races.json`)]);
      return buildAthlete(id, athlete, races, index);
    } catch (error) {
      return { id, error };
    }
  }));
  const athletes = loaded.filter((a) => !a.error);
  const races = athletes.flatMap((a) => a.races).sort(compare('date', -1));
  const events = groupEvents(races);
  for (const group of events.values()) {
    const isShared = new Set(group.map((r) => r.athlete.id)).size > 1;
    for (const race of group) race.shared = isShared;
  }
  return {
    site: { title: 'my runD+', locale: 'en-GB', ...site },
    athletes,
    races,
    events,
    errors: loaded.filter((a) => a.error),
    athlete: (id) => athletes.find((a) => a.id === id) ?? null,
  };
}

/** Group races by their `event` key (races without a key are skipped). */
export function groupEvents(races) {
  const events = new Map();
  for (const race of races) {
    if (!race.event) continue;
    if (!events.has(race.event)) events.set(race.event, []);
    events.get(race.event).push(race);
  }
  for (const group of events.values()) group.sort(byResult);
  return events;
}

/** Order for results: finishers by time, then everyone else by distance covered. */
function byResult(a, b) {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished) return (a.seconds ?? Infinity) - (b.seconds ?? Infinity);
  return (b.coveredKm ?? 0) - (a.coveredKm ?? 0);
}

/** Events run by more than one athlete, most athletes first, then most recent. */
export function sharedEvents(events) {
  return [...events.entries()]
    .filter(([, group]) => group[0].shared)
    .sort(([, a], [, b]) => b.length - a.length || b[0].date.localeCompare(a[0].date))
    .map(([key, races]) => ({ key, races, href: `#/event/${encodeURIComponent(key)}` }));
}

const SORT_KEYS = {
  date: (r) => r.date,
  name: (r) => r.title.toLowerCase(),
  athlete: (r) => r.athlete.name.toLowerCase(),
  km: (r) => r.distanceKm,
  gain: (r) => r.elevationGainM,
  time: (r) => (r.finished ? r.seconds : null),
  pace: (r) => (r.finished ? r.pace : null),
  rank: (r) => r.pct.overall,
};

/** Comparator for a sort key; missing values always sort last. */
export function compare(key, direction = 1) {
  const pick = SORT_KEYS[key] ?? SORT_KEYS.date;
  return (a, b) => {
    const [x, y] = [pick(a) ?? null, pick(b) ?? null];
    if (x === null || y === null) return (x === null) - (y === null);
    return (x < y ? -1 : x > y ? 1 : 0) * direction;
  };
}

/** Sorted copy of `races` by one of: date, name, athlete, km, gain, time, pace, rank. */
export function sortRaces(races, key = 'date', dir = 'desc') {
  return [...races].sort(compare(key, dir === 'asc' ? 1 : -1));
}

/**
 * Filter races by free text and exact facets.
 * @param {object[]} races
 * @param {{q?:string, year?:string, type?:string, country?:string, status?:string, athlete?:string}} filters
 */
export function filterRaces(races, filters = {}) {
  const q = (filters.q ?? '').trim().toLowerCase();
  return races.filter((r) => {
    if (filters.year && String(r.year) !== String(filters.year)) return false;
    if (filters.type && r.type !== filters.type) return false;
    if (filters.country && r.location?.country !== filters.country) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.athlete && r.athlete.id !== filters.athlete) return false;
    if (!q) return true;
    const text = [r.title, r.location?.place, r.location?.region, r.athlete.name, ...(r.tags ?? [])];
    return text.filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

/** Distinct filter values present in a list of races. */
export function facets(races) {
  const distinct = (pick) => [...new Set(races.map(pick).filter(Boolean))].sort();
  return {
    year: distinct((r) => r.year).reverse(),
    type: TYPES.filter((t) => races.some((r) => r.type === t)),
    country: distinct((r) => r.location?.country),
    status: STATUSES.filter((s) => races.some((r) => r.status === s)),
  };
}

/** Km and D+ per year: Map<year, {km, gainM, races}> in ascending year order. */
export function perYear(races) {
  const years = new Map();
  for (const race of [...races].sort(compare('date', 1))) {
    if (!race.year) continue;
    const y = years.get(race.year) ?? { km: 0, gainM: 0, races: 0 };
    y.km += race.coveredKm ?? 0;
    y.gainM += race.finished ? race.elevationGainM ?? 0 : 0;
    y.races += 1;
    years.set(race.year, y);
  }
  return years;
}

/** Personal bests per race type among finished races. */
export function personalBests(races) {
  const best = (list, pick, sign) => list.filter((r) => isNum(pick(r)))
    .sort((a, b) => (pick(a) - pick(b)) * sign)[0] ?? null;
  return TYPES.map((type) => {
    const list = races.filter((r) => r.type === type && r.finished);
    return {
      type,
      count: list.length,
      fastest: best(list, (r) => r.effortPace, 1),
      longest: best(list, (r) => r.distanceKm, -1),
      bestRank: best(list, (r) => r.pct.overall, 1),
    };
  }).filter((pb) => pb.count);
}

/**
 * Head-to-head over the events that at least two of the given athletes ran.
 * @returns {{rows:{key:string, races:object[], winner:object|null, gapS:number|null}[], wins:Map<string, number>}}
 */
export function headToHead(athleteIds, events) {
  const wins = new Map(athleteIds.map((id) => [id, 0]));
  const rows = [];
  for (const [key, group] of events) {
    const races = group.filter((r) => athleteIds.includes(r.athlete.id));
    if (new Set(races.map((r) => r.athlete.id)).size < 2) continue;
    const winner = races[0].finished ? races[0] : null;
    if (winner) wins.set(winner.athlete.id, wins.get(winner.athlete.id) + 1);
    const gapS = winner && races[1].finished ? races[1].seconds - winner.seconds : null;
    rows.push({ key, races, winner, gapS });
  }
  rows.sort((a, b) => b.races[0].date.localeCompare(a.races[0].date));
  return { rows, wins };
}
