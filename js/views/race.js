/** Race detail: key numbers, rankings, map with linked elevation profile, splits, notes, photos. */
import { parseGpx, splits, timeAtDistance } from '../gpx.js';
import { formatDate, formatDuration, formatKm, formatM, formatNumber, formatPace, isoOffsetMinutes, parseHms, flag } from '../format.js';
import { trackMap } from '../map.js';
import { renderProfile } from '../profile.js';
import { athleteChip, esc, html, notice, raw, resultText, statusBadge, tiles, TYPE_LABEL } from '../ui.js';

const tracks = new Map();
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : null);

/** Fetch and parse a GPX file (cached per URL for the session). */
export function loadTrack(url) {
  if (!tracks.has(url)) {
    const pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.text();
    }).then(parseGpx);
    pending.catch(() => tracks.delete(url));
    tracks.set(url, pending);
  }
  return tracks.get(url);
}

/** Markdown-lite: blank-line separated paragraphs and **bold**. */
function markdownLite(text) {
  return raw(String(text).trim().split(/\n\s*\n/)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`).join(''));
}

function keyNumbers(race, track, locale) {
  const gps = (value, format) => (value === null || value === undefined ? null : `GPS ${format(value)}`);
  return tiles([
    [race.finished ? 'Official time' : 'Result', resultText(race), !race.finished && race.seconds ? `after ${formatDuration(race.seconds)}` : null],
    ['Distance', formatKm(race.distanceKm ?? track?.distanceKm, locale), race.distanceKm ? gps(track?.distanceKm, (v) => formatKm(v, locale)) : track && 'from GPS'],
    ['Elevation gain', formatM(race.elevationGainM ?? track?.gainM, locale), race.elevationGainM ? gps(track?.gainM, (v) => formatM(v, locale)) : track && 'from GPS'],
    ['Elevation loss', formatM(race.elevationLossM ?? track?.lossM, locale), race.elevationLossM ? gps(track?.lossM, (v) => formatM(v, locale)) : track && 'from GPS'],
    ['Pace', formatPace(race.pace)],
    ['Effort pace', formatPace(race.effortPace), race.effortKm ? `${formatNumber(race.effortKm, locale, 1)} effort-km` : null],
    ['ITRA', race.itraScore ?? race.itraPoints ?? null, [race.itraScore && 'score', race.itraPoints && `${race.itraPoints} points`].filter(Boolean).join(' · ')],
    ['UTMB Index', race.utmbIndex ?? null, race.utmbStones ? `${race.utmbStones} Running Stones` : null],
    ['Bib', race.bib ?? null],
  ]);
}

function rankings(race) {
  const r = race.ranking ?? {};
  const rows = [
    ['Overall', r.overall, r.overallTotal, race.pct.overall],
    ['Gender', r.gender, r.genderTotal, race.pct.gender],
    [r.categoryName ? `Category ${r.categoryName}` : 'Category', r.category, r.categoryTotal, race.pct.category],
  ].filter(([, rank]) => rank > 0);
  if (!rows.length) return '';
  return html`<section aria-labelledby="h-rank"><h2 id="h-rank">Rankings</h2>
    <ul class="ranks">${rows.map(([label, rank, total, pct]) => html`<li>
      <span>${label}</span><strong>${rank}${total ? html` <span class="muted">/ ${total}</span>` : ''}</strong>
      ${pct === null ? '' : html`<span class="rank-bar" role="img" aria-label="Top ${pct}%"><span style="width:${pct}%"></span></span><span>Top ${pct}%</span>`}
    </li>`)}</ul></section>`;
}

function splitsTable(race, track, mode, locale) {
  const aid = race.aid ?? [];
  const modes = [aid.length && ['aid', 'Aid stations'], track?.startTime && ['1', 'Every km'], track?.startTime && ['5', 'Every 5 km']].filter(Boolean);
  if (!modes.length) return '';
  const fallback = aid.length ? 'aid' : track.distanceKm <= 25 ? '1' : '5';
  const active = modes.some(([m]) => m === mode) ? mode : fallback;
  let rows;
  if (active === 'aid') {
    const stops = aid.map((a) => ({ name: a.name, km: a.km, elapsedS: parseHms(a.time) ?? (track && Number.isFinite(a.km) ? timeAtDistance(track, a.km) : null) }));
    if (race.finished && race.seconds && race.distanceKm) stops.push({ name: 'Finish', km: race.distanceKm, elapsedS: race.seconds });
    let prev = { km: 0, elapsedS: 0 };
    rows = stops.map((s) => {
      const usable = s.elapsedS !== null && prev.elapsedS !== null && s.km > prev.km;
      const row = { ...s, splitS: usable ? s.elapsedS - prev.elapsedS : null, lengthKm: s.km - prev.km };
      prev = s;
      return row;
    });
  } else {
    rows = splits(track, Number(active)).map((s) => ({ ...s, name: `km ${formatNumber(s.km, locale, 1)}` }));
  }
  return html`<section aria-labelledby="h-splits"><h2 id="h-splits">Splits</h2>
    ${modes.length > 1 ? html`<p class="segmented">${modes.map(([m, label]) => html`
      <button type="button" data-split="${m}" aria-pressed="${m === active}">${label}</button>`)}</p>` : ''}
    <div class="table-wrap"><table class="simple">
      <thead><tr><th scope="col">${active === 'aid' ? 'Checkpoint' : 'Split'}</th>${active === 'aid' ? html`<th scope="col" class="num">km</th>` : ''}
        <th scope="col" class="num">Split</th><th scope="col" class="num">Pace</th>
        ${active === 'aid' ? '' : html`<th scope="col" class="num">± m</th>`}<th scope="col" class="num">Elapsed</th></tr></thead>
      <tbody>${rows.map((s) => html`<tr><th scope="row">${s.name}</th>
        ${active === 'aid' ? html`<td class="num">${formatNumber(s.km, locale, 1)}</td>` : ''}
        <td class="num">${formatDuration(s.splitS)}</td><td class="num">${formatPace(s.splitS / s.lengthKm)}</td>
        ${active === 'aid' ? '' : html`<td class="num">${s.eleDiffM === null ? '–' : `${s.eleDiffM > 0 ? '+' : ''}${Math.round(s.eleDiffM)}`}</td>`}
        <td class="num">${formatDuration(s.elapsedS)}</td></tr>`)}</tbody></table></div></section>`;
}

function gpsStats(track, locale) {
  return html`<section aria-labelledby="h-gps"><h2 id="h-gps">GPS stats</h2>${tiles([
    ['Moving time', track.movingS === null ? null : formatDuration(track.movingS)],
    ['Stopped time', track.stoppedS === null ? null : formatDuration(track.stoppedS)],
    ['GPS elapsed', track.elapsedS === null ? null : formatDuration(track.elapsedS)],
    ['Max altitude', track.maxEle === null ? null : formatM(track.maxEle, locale)],
    ['Min altitude', track.minEle === null ? null : formatM(track.minEle, locale)],
    ['Average HR', track.avgHr === null ? null : `${Math.round(track.avgHr)} bpm`],
    ['Track points', formatNumber(track.points.length, locale)],
  ])}</section>`;
}

function story(race) {
  const gear = Object.entries(race.gear ?? {}).map(([key, value]) => (value === true ? key : value === false ? `no ${key}` : `${key}: ${value}`));
  const rating = Math.max(0, Math.min(5, Math.round(race.rating ?? 0)));
  if (!race.notes && !race.weather && !gear.length && !rating && !race.tags?.length) return '';
  return html`<section aria-labelledby="h-story"><h2 id="h-story">Notes</h2>
    ${rating ? html`<p class="rating" role="img" aria-label="Rated ${rating} out of 5">${'★'.repeat(rating)}<span class="muted">${'★'.repeat(5 - rating)}</span></p>` : ''}
    ${race.notes ? markdownLite(race.notes) : ''}
    <dl class="facts">
      ${race.weather ? html`<dt>Weather</dt><dd>${race.weather}</dd>` : ''}
      ${gear.length ? html`<dt>Gear</dt><dd>${gear.join(' · ')}</dd>` : ''}
    </dl>
    ${race.tags?.length ? html`<p class="tags">${race.tags.map((tag) => html`<span class="tag">#${tag}</span>`)}</p>` : ''}
  </section>`;
}

function alsoRan(race, data, locale) {
  const others = (data.events.get(race.event) ?? []).filter((r) => r !== race);
  if (!others.length) return '';
  return html`<aside class="card also-ran" aria-labelledby="h-also"><h2 id="h-also">Also ran this race</h2>
    <ul class="plain">${others.map((o) => html`<li>${athleteChip(o.athlete)} <a href="${o.href}">${resultText(o)}</a>
      ${race.finished && o.finished ? html`<span class="muted">(${formatDuration(Math.abs(o.seconds - race.seconds))} ${o.seconds < race.seconds ? 'ahead' : 'behind'})</span>` : ''}</li>`)}</ul>
    <p><a href="#/event/${encodeURIComponent(race.event)}">Compare everyone on this event →</a></p></aside>`;
}

/** Render the race view; the page is usable before (and without) the GPX file. */
export async function renderRace(el, ctx, athleteId, raceId) {
  const { data, locale } = ctx;
  const athlete = data.athlete(athleteId);
  const race = athlete?.races.find((r) => r.id === raceId);
  if (!race) throw new Error(`Race "${raceId}" of athlete "${athleteId}" was not found.`);
  const index = athlete.races.indexOf(race);
  const [newer, older] = [athlete.races[index - 1], athlete.races[index + 1]];
  const loc = race.location ?? {};
  const links = [['results', 'Results'], ['official', 'Official site'], ['strava', 'Strava']].filter(([key]) => safeUrl(race.links?.[key]));
  ctx.setMeta([athlete.name, race.title], `${race.title}, ${formatDate(race.date, locale)}: ${resultText(race)} by ${athlete.name}.`);
  el.innerHTML = html`
    <p class="crumbs">${athleteChip(athlete)}</p>
    <h1>${race.name ?? race.id} ${race.course ? html`<span class="muted">${race.course}</span>` : ''}</h1>
    <p class="subhead"><time datetime="${race.date}">${formatDate(race.date, locale, 'full')}</time>
      ${loc.place ? html` · ${flag(loc.country)} ${[loc.place, loc.region].filter(Boolean).join(', ')}` : ''}
      · <span class="tag">${TYPE_LABEL[race.type]}</span> ${statusBadge(race.status)}</p>
    <div id="race-numbers">${keyNumbers(race, null, locale)}</div>
    ${rankings(race)}
    ${alsoRan(race, data, locale)}
    <section aria-labelledby="h-track"><h2 id="h-track">Track and elevation</h2>
      <div id="race-track">${race.gpxUrl ? notice('Loading GPS track…') : notice('No GPS track for this race.')}</div>
      ${race.gpxUrl ? html`<p><a class="button" href="${race.gpxUrl}" download>Download GPX</a></p>` : ''}
    </section>
    <div id="race-splits">${splitsTable(race, null, ctx.query.get('split'), locale)}</div>
    <div id="race-gps"></div>
    ${story(race)}
    ${race.photos.length ? html`<section aria-labelledby="h-photos"><h2 id="h-photos">Photos</h2>
      <div class="gallery">${race.photos.map((p) => html`<figure><a href="${p.src}"><img src="${p.src}" loading="lazy" decoding="async" alt="${p.caption ?? `${race.title} photo`}"></a>
        ${p.caption ? html`<figcaption>${p.caption}</figcaption>` : ''}</figure>`)}</div></section>` : ''}
    ${links.length ? html`<p class="links">${links.map(([key, label]) => html`<a href="${race.links[key]}" rel="noopener">${label}</a>`)}</p>` : ''}
    <nav class="prev-next" aria-label="Other races of ${athlete.name}">
      ${older ? html`<a href="${older.href}" rel="prev">← ${older.title}<small>${formatDate(older.date, locale)}</small></a>` : html`<span></span>`}
      ${newer ? html`<a href="${newer.href}" rel="next">${newer.title} →<small>${formatDate(newer.date, locale)}</small></a>` : html`<span></span>`}
    </nav>`;

  let track = null;
  const drawSplits = () => { el.querySelector('#race-splits').innerHTML = splitsTable(race, track, ctx.query.get('split'), locale); };
  el.querySelector('#race-splits').addEventListener('click', (event) => {
    const mode = event.target.closest('[data-split]')?.dataset.split;
    if (!mode) return;
    ctx.setQuery({ split: mode });
    drawSplits();
    el.querySelector(`[data-split="${mode}"]`)?.focus();
  });
  if (!race.gpxUrl) return;

  const box = el.querySelector('#race-track');
  try {
    track = await loadTrack(race.gpxUrl);
  } catch (error) {
    if (ctx.alive()) box.innerHTML = notice(`The GPS track could not be loaded (${error.message}). Everything else on this page still works.`, 'error');
    return;
  }
  if (!ctx.alive()) return;
  box.innerHTML = '<div class="map map-track" id="race-map"></div><div id="race-profile"></div>';
  const aid = race.aid ?? [];
  let profile = null;
  const map = trackMap(box.querySelector('#race-map'), [{ track, color: athlete.color, label: athlete.name }], {
    aid,
    onHover: (km) => profile?.highlight(km),
  });
  profile = renderProfile(box.querySelector('#race-profile'), track, {
    locale, aid, color: athlete.color,
    offsetMin: isoOffsetMinutes(race.startTime),
    onHover: (point) => map?.showAt(point),
  });
  el.querySelector('#race-numbers').innerHTML = keyNumbers(race, track, locale);
  el.querySelector('#race-gps').innerHTML = gpsStats(track, locale);
  drawSplits();
}
