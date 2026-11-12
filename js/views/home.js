/** Home: every athlete at a glance, the combined map and table, and club stats. */
import { perYear, sharedEvents } from '../data.js';
import { formatDate, formatHours, formatKm, formatM, flag } from '../format.js';
import { overviewMap } from '../map.js';
import { athleteChip, avatar, esc, html, notice, raceTable, resultText, statusBadge, yearCharts } from '../ui.js';

/** Popup HTML for a race marker on the overview maps. */
export function racePopup(race, locale) {
  return `<strong><a href="${esc(race.href)}">${esc(race.title)}</a></strong><br>${esc(race.athlete.name)} · ${esc(formatDate(race.date, locale))}<br>${esc(resultText(race))}`;
}

function athleteCard(athlete, locale) {
  const t = athlete.totals;
  return html`<li><a class="card athlete-card" href="${athlete.href}" style="--c:${athlete.color}">
    ${avatar(athlete)}
    <span class="card-body">
      <strong>${athlete.name}</strong>
      ${athlete.club ? html`<span class="muted">${athlete.club}</span>` : ''}
      <span>${t.races} races · ${formatKm(t.km, locale, 0)} · ${formatM(t.gainM, locale)} D+</span>
      ${t.latest ? html`<span class="muted">Latest: ${t.latest.title}, ${formatDate(t.latest.date, locale)}</span>` : html`<span class="muted">No races yet</span>`}
    </span></a></li>`;
}

function feedItem(race, locale) {
  return html`<li class="feed-item" style="--c:${race.athlete.color}">
    <time datetime="${race.date}">${formatDate(race.date, locale)}</time>
    <a class="race-link" href="${race.href}">${race.title}</a>
    <span>${athleteChip(race.athlete)} ${race.location?.country ? flag(race.location.country) : ''}
      ${race.finished ? html`<strong>${resultText(race)}</strong>` : statusBadge(race.status)}</span>
  </li>`;
}

/** Render the home view. */
export function renderHome(el, ctx) {
  const { data, locale } = ctx;
  const { athletes, races } = data;
  const shared = sharedEvents(data.events);
  const totalSeconds = athletes.reduce((sum, a) => sum + a.totals.seconds, 0);
  ctx.setMeta([], `Trail running race log of ${athletes.map((a) => a.name).join(', ') || 'our athletes'}.`);
  el.innerHTML = html`
    <h1 class="visually-hidden">${data.site.title}: athletes and races</h1>
    ${data.errors.map((e) => notice(`Could not load athlete "${e.id}" (${e.error.message}). The rest of the site still works.`, 'error'))}
    <section aria-labelledby="h-athletes">
      <h2 id="h-athletes">Athletes</h2>
      ${athletes.length ? html`<ul class="cards">${athletes.map((a) => athleteCard(a, locale))}</ul>`
    : notice('No athletes yet. Add one with: node scripts/new-athlete.mjs <id> "<Full Name>"')}
    </section>
    <section aria-labelledby="h-map">
      <h2 id="h-map">Where we raced</h2>
      <div class="map map-overview" id="home-map"></div>
      <p class="legend" id="home-legend">${athletes.map((a) => html`
        <button type="button" class="chip toggle" aria-pressed="true" data-athlete="${a.id}"><span class="dot" style="--c:${a.color}"></span>${a.name}</button>`)}</p>
    </section>
    <section aria-labelledby="h-latest">
      <h2 id="h-latest">Latest races</h2>
      <ol class="feed">${races.slice(0, 5).map((r) => feedItem(r, locale))}</ol>
    </section>
    <section aria-labelledby="h-all">
      <h2 id="h-all">All races</h2>
      <div id="home-table"></div>
    </section>
    <section aria-labelledby="h-club">
      <h2 id="h-club">Club stats</h2>
      <p class="muted">${races.length} races · ${formatKm(athletes.reduce((s, a) => s + a.totals.km, 0), locale, 0)} ·
        ${formatM(athletes.reduce((s, a) => s + a.totals.gainM, 0), locale)} D+ · ${formatHours(totalSeconds)} on course</p>
      ${yearCharts(athletes, perYear, locale)}
      <h3>Most-shared events</h3>
      ${shared.length ? html`<ul class="plain">${shared.slice(0, 8).map((e) => html`
        <li><a href="${e.href}">${e.races[0].title}</a> <span class="muted">${formatDate(e.races[0].date, locale)}</span>
          · ${e.races.length} athletes: ${e.races.map((r) => athleteChip(r.athlete, false))}</li>`)}</ul>`
    : notice('No event has been run by more than one athlete yet.')}
    </section>`;

  const map = overviewMap(el.querySelector('#home-map'), races, (race) => racePopup(race, locale));
  el.querySelector('#home-legend').addEventListener('click', (event) => {
    const button = event.target.closest('[data-athlete]');
    if (!button) return;
    const visible = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(visible));
    map?.setVisible(button.dataset.athlete, visible);
  });
  raceTable(el.querySelector('#home-table'), races, ctx, { athletes });
}
