/** Event page: every athlete who ran the same `event`, their tracks and checkpoint gaps. */
import { timeAtDistance } from '../gpx.js';
import { formatDate, formatDuration, formatGap, formatKm, formatM, formatNumber, formatPace, formatRank, parseHms, flag } from '../format.js';
import { trackMap } from '../map.js';
import { athleteChip, html, notice, resultText } from '../ui.js';
import { loadTrack } from './race.js';

/**
 * Checkpoints shared by all athletes: the aid stations of the first race that lists
 * them, otherwise regular distances along the GPS tracks, plus the finish.
 */
function checkpoints(races, tracks) {
  const aid = races.map((r) => r.aid ?? []).find((list) => list.some((a) => Number.isFinite(a.km))) ?? [];
  const points = aid.filter((a) => Number.isFinite(a.km)).map((a) => ({ name: a.name, km: a.km }));
  const loaded = tracks.filter((t) => t?.startTime);
  if (!points.length && loaded.length) {
    const longest = Math.max(...loaded.map((t) => t.distanceKm));
    const step = [1, 2, 5, 10, 20].find((s) => longest / s <= 12) ?? 25;
    for (let km = step; km < longest - step / 2; km += step) points.push({ name: `km ${km}`, km });
  }
  const finishKm = races.find((r) => r.distanceKm)?.distanceKm ?? null;
  return [...points, { name: 'Finish', km: finishKm, finish: true }];
}

function gapTable(races, tracks, locale) {
  const rows = checkpoints(races, tracks).map((cp) => {
    const times = races.map((race, i) => {
      if (cp.finish) return race.finished ? race.seconds : null;
      const official = parseHms(race.aid?.find((a) => a.name === cp.name)?.time);
      return official ?? (tracks[i] ? timeAtDistance(tracks[i], cp.km) : null);
    });
    const known = times.filter((t) => t !== null);
    return { ...cp, times, best: known.length ? Math.min(...known) : null, contested: known.length > 1 };
  }).filter((row) => row.best !== null);
  if (rows.length < 2) return notice('Checkpoint gaps need aid-station times or GPS tracks with timestamps for these athletes.');
  return html`<div class="table-wrap"><table class="simple">
    <thead><tr><th scope="col">Checkpoint</th><th scope="col" class="num">km</th>
      ${races.map((r) => html`<th scope="col" class="num">${athleteChip(r.athlete, false)}</th>`)}</tr></thead>
    <tbody>${rows.map((row) => html`<tr><th scope="row">${row.name}</th><td class="num">${formatNumber(row.km, locale, 1)}</td>
      ${row.times.map((t) => html`<td class="num">${t === null ? '–' : html`${formatDuration(t)}
        ${row.contested ? html`<small class="${t === row.best ? 'lead' : 'muted'}">${t === row.best ? 'leader' : formatGap(t - row.best)}</small>` : ''}`}</td>`)}</tr>`)}</tbody>
  </table></div>
  <p class="muted small">Times are elapsed since the start: official aid-station times when listed, otherwise read from the GPS track at the same distance.</p>`;
}

/** Render the event view; throws when no race uses this event key. */
export async function renderEvent(el, ctx, key) {
  const { data, locale } = ctx;
  const races = data.events.get(key);
  if (!races) throw new Error(`No race uses the event key "${key}".`);
  const first = races[0];
  const best = first.finished ? first.seconds : null;
  const loc = first.location ?? {};
  ctx.setMeta(['Event', first.title], `${first.title}: results of ${races.map((r) => r.athlete.name).join(', ')}.`);
  el.innerHTML = html`
    <p class="crumbs muted">Event</p>
    <h1>${first.name ?? first.id} ${first.course ? html`<span class="muted">${first.course}</span>` : ''}</h1>
    <p class="subhead"><time datetime="${first.date}">${formatDate(first.date, locale, 'full')}</time>
      ${loc.place ? html` · ${flag(loc.country)} ${loc.place}` : ''}
      · ${formatKm(first.distanceKm, locale)} · ${formatM(first.elevationGainM, locale)} D+</p>
    <section aria-labelledby="h-results"><h2 id="h-results">Results</h2>
      <div class="table-wrap"><table class="simple">
        <thead><tr><th scope="col">#</th><th scope="col">Athlete</th><th scope="col" class="num">Time</th><th scope="col" class="num">Gap</th>
          <th scope="col" class="num">Pace</th><th scope="col">Overall</th><th scope="col">Gender</th><th scope="col">Category</th></tr></thead>
        <tbody>${races.map((r, i) => html`<tr>
          <td>${r.finished ? i + 1 : '–'}</td><th scope="row">${athleteChip(r.athlete)}</th>
          <td class="num"><a href="${r.href}">${resultText(r)}</a></td>
          <td class="num">${r.finished && best !== null && i > 0 ? formatGap(r.seconds - best) : '–'}</td>
          <td class="num">${r.finished ? formatPace(r.pace) : '–'}</td>
          <td>${formatRank(r.ranking?.overall, r.ranking?.overallTotal)}</td>
          <td>${formatRank(r.ranking?.gender, r.ranking?.genderTotal)}</td>
          <td>${r.ranking?.categoryName ?? ''} ${formatRank(r.ranking?.category, r.ranking?.categoryTotal)}</td></tr>`)}</tbody>
      </table></div></section>
    <section aria-labelledby="h-tracks"><h2 id="h-tracks">Tracks</h2><div id="event-tracks">${notice('Loading GPS tracks…')}</div></section>
    <section aria-labelledby="h-gaps"><h2 id="h-gaps">Checkpoint by checkpoint</h2><div id="event-gaps">${notice('Loading…')}</div></section>`;

  const failed = [];
  const tracks = await Promise.all(races.map((race) => (race.gpxUrl
    ? loadTrack(race.gpxUrl).catch(() => { failed.push(race.athlete.name); return null; }) : null)));
  if (!ctx.alive()) return;
  const entries = races.map((race, i) => ({ track: tracks[i], color: race.athlete.color, label: race.athlete.name })).filter((e) => e.track);
  const box = el.querySelector('#event-tracks');
  box.innerHTML = html`
    ${failed.length ? notice(`The GPS track of ${failed.join(', ')} could not be loaded.`, 'error') : ''}
    ${entries.length ? html`<div class="map map-track" id="event-map"></div>
      <p class="legend">${entries.map((e) => html`<span class="chip"><span class="dot" style="--c:${e.color}"></span>${e.label}</span>`)}</p>`
    : notice('No GPS track is available for this event.')}`;
  if (entries.length) trackMap(box.querySelector('#event-map'), entries, { aid: races.find((r) => r.aid?.length)?.aid ?? [] });
  el.querySelector('#event-gaps').innerHTML = gapTable(races, tracks, locale);
}
