/** Leaflet helpers. Leaflet is the global `L`; every function degrades when it failed to load. */
import { downsample, nearestIndex, pointAtDistance } from './gpx.js';
import { esc } from './ui.js';

const LAYERS = {
  OpenTopoMap: ['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  }],
  OpenStreetMap: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }],
};
const live = new Set();

/** Remove every map created for the previous view. */
export function disposeMaps() {
  for (const map of live) map.remove();
  live.clear();
}

function createMap(el, base) {
  const L = globalThis.L;
  if (!L) {
    el.innerHTML = '<p class="notice notice-error">The map library could not be loaded.</p>';
    return null;
  }
  const map = L.map(el, { scrollWheelZoom: false });
  const layers = Object.fromEntries(Object.entries(LAYERS).map(([name, [url, opts]]) => [name, L.tileLayer(url, opts)]));
  layers[base].addTo(map);
  L.control.layers(layers).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  live.add(map);
  return map;
}

const pin = (color, text = '', className = 'pin') => globalThis.L.divIcon({
  className: '', iconSize: [0, 0],
  html: `<span class="${className}" style="--c:${esc(color)}">${esc(text)}</span>`,
});

/**
 * Overview map with one marker per race placed at `location.lat/lon` (never loads GPX).
 * Races at the same spot are fanned out so every marker stays clickable.
 * @param {HTMLElement} el
 * @param {object[]} races derived races
 * @param {(race:object) => string} describe popup HTML for a race
 * @returns {{setVisible:(athleteId:string, visible:boolean) => void}|null}
 */
export function overviewMap(el, races, describe) {
  const located = races.filter((r) => Number.isFinite(r.location?.lat) && Number.isFinite(r.location?.lon));
  if (!located.length) {
    el.innerHTML = '<p class="notice">No race has a location yet.</p>';
    return null;
  }
  const map = createMap(el, 'OpenStreetMap');
  if (!map) return null;
  const L = globalThis.L;
  const groups = new Map();
  const seen = new Map();
  for (const race of located) {
    const spot = `${race.location.lat.toFixed(2)},${race.location.lon.toFixed(2)}`;
    const n = seen.get(spot) ?? 0;
    seen.set(spot, n + 1);
    const icon = pin(race.athlete.color);
    icon.options.iconAnchor = [-n * 9, n * 5];
    const marker = L.marker([race.location.lat, race.location.lon], { icon, title: `${race.title} · ${race.athlete.name}`, alt: race.title })
      .bindPopup(describe(race));
    if (!groups.has(race.athlete.id)) groups.set(race.athlete.id, L.layerGroup().addTo(map));
    groups.get(race.athlete.id).addLayer(marker);
  }
  map.fitBounds(L.latLngBounds(located.map((r) => [r.location.lat, r.location.lon])).pad(0.25), { maxZoom: 10 });
  return {
    setVisible(athleteId, visible) {
      const group = groups.get(athleteId);
      if (group) (visible ? group.addTo(map) : group.remove());
    },
  };
}

const kmStep = (km) => (km <= 15 ? 1 : km <= 60 ? 5 : 10);

/**
 * Track map: one or more GPS tracks, start and finish, aid stations placed by
 * cumulative distance, km markers and a position marker linked to the profile.
 * @param {HTMLElement} el
 * @param {{track:object, color:string, label:string}[]} entries
 * @param {{aid?:{name:string, km:number}[], onHover?:(km:number|null) => void}} [options]
 * @returns {{showAt:(point:{lat:number, lon:number}|null) => void}|null}
 */
export function trackMap(el, entries, { aid = [], onHover = null } = {}) {
  const map = createMap(el, 'OpenTopoMap');
  if (!map) return null;
  const L = globalThis.L;
  const bounds = L.latLngBounds([]);
  entries.forEach(({ track, color, label }, index) => {
    const points = downsample(track.points);
    const line = points.map((p) => [p.lat, p.lon]);
    L.polyline(line, { color: '#fff', weight: 7, opacity: 0.85, interactive: false }).addTo(map);
    const path = L.polyline(line, { color, weight: 3.5, opacity: 0.95 }).addTo(map).bindTooltip(label, { sticky: true });
    bounds.extend(path.getBounds());
    if (index === 0 && onHover) {
      path.on('mousemove', (e) => onHover(points[nearestIndex(points, { lat: e.latlng.lat, lon: e.latlng.lng })].dist));
      path.on('mouseout', () => onHover(null));
    }
    const end = track.points.at(-1);
    L.marker([end.lat, end.lon], { icon: pin(color, '■', 'pin pin-end'), title: `Finish · ${label}`, alt: 'Finish' }).addTo(map);
    if (index > 0) return;
    const step = kmStep(track.distanceKm);
    for (let km = step; km < track.distanceKm; km += step) {
      const p = pointAtDistance(track, km);
      L.marker([p.lat, p.lon], { icon: pin(color, String(km), 'pin pin-km'), interactive: false, keyboard: false }).addTo(map);
    }
    for (const stop of aid.filter((a) => Number.isFinite(a.km) && a.km <= track.distanceKm + 0.5)) {
      const p = pointAtDistance(track, stop.km);
      L.marker([p.lat, p.lon], { icon: pin(color, '✚', 'pin pin-aid'), title: stop.name, alt: `Aid station ${stop.name}` })
        .addTo(map).bindPopup(`<strong>${esc(stop.name)}</strong><br>km ${esc(stop.km)}`);
    }
    const start = track.points[0];
    L.marker([start.lat, start.lon], { icon: pin(color, '▶', 'pin pin-start'), title: 'Start', alt: 'Start' }).addTo(map);
  });
  map.fitBounds(bounds.pad(0.08));
  const cursor = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1, interactive: false });
  return {
    showAt(point) {
      if (!point) return void cursor.remove();
      cursor.setLatLng([point.lat, point.lon]).addTo(map);
    },
  };
}
