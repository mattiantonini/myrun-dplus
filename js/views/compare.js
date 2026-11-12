/** Compare: totals side by side, shared events with winner and gap, head-to-head count. */
import { headToHead } from '../data.js';
import { formatDate, formatGap, formatHours, formatKm, formatM, formatNumber, formatPace } from '../format.js';
import { athleteChip, html, notice, resultText } from '../ui.js';

function totalsTable(athletes, locale) {
  const avgEffortPace = (a) => {
    const done = a.races.filter((r) => r.effortPace);
    return done.length ? done.reduce((s, r) => s + r.seconds, 0) / done.reduce((s, r) => s + r.effortKm, 0) : null;
  };
  const rows = [
    ['Races', (a) => a.totals.races],
    ['Finishes', (a) => a.totals.finishes],
    ['DNFs', (a) => a.totals.dnfs],
    ['Distance', (a) => formatKm(a.totals.km, locale, 0)],
    ['Elevation gain', (a) => formatM(a.totals.gainM, locale)],
    ['Time on course', (a) => formatHours(a.totals.seconds)],
    ['Countries', (a) => a.totals.countries.length],
    ['Average effort pace', (a) => formatPace(avgEffortPace(a))],
    ['Longest race', (a) => formatKm(Math.max(...a.races.filter((r) => r.finished).map((r) => r.distanceKm ?? 0), 0) || null, locale)],
  ];
  return html`<div class="table-wrap"><table class="simple">
    <thead><tr><td></td>${athletes.map((a) => html`<th scope="col" class="num">${athleteChip(a)}</th>`)}</tr></thead>
    <tbody>${rows.map(([label, pick]) => html`<tr><th scope="row">${label}</th>${athletes.map((a) => html`<td class="num">${pick(a)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

function sharedTable(athletes, events, locale) {
  const { rows, wins } = headToHead(athletes.map((a) => a.id), events);
  if (!rows.length) return notice('These athletes have not run the same event yet. Give their races the same "event" key to link them.');
  return html`
    <p class="h2h" aria-label="Head-to-head wins">${athletes.map((a) => html`
      <span class="h2h-score" style="--c:${a.color}"><strong>${formatNumber(wins.get(a.id), locale)}</strong> ${a.name}</span>`)}</p>
    <p class="muted small">Wins on ${rows.length} shared ${rows.length === 1 ? 'event' : 'events'} (fastest finisher among the selected athletes).</p>
    <div class="table-wrap"><table class="simple">
      <thead><tr><th scope="col">Event</th>${athletes.map((a) => html`<th scope="col" class="num">${athleteChip(a, false)}</th>`)}
        <th scope="col">Winner</th><th scope="col" class="num">Gap</th></tr></thead>
      <tbody>${rows.map((row) => html`<tr>
        <th scope="row"><a href="#/event/${encodeURIComponent(row.key)}">${row.races[0].title}</a>
          <small class="muted">${formatDate(row.races[0].date, locale)}</small></th>
        ${athletes.map((a) => {
    const race = row.races.find((r) => r.athlete.id === a.id);
    return html`<td class="num">${race ? html`<a href="${race.href}">${resultText(race)}</a>` : '–'}</td>`;
  })}
        <td>${row.winner ? athleteChip(row.winner.athlete, false) : '–'}</td>
        <td class="num">${row.gapS === null ? '–' : formatGap(row.gapS)}</td></tr>`)}</tbody>
    </table></div>`;
}

/** Render the compare view for the athletes listed in `?ids=a,b`. */
export function renderCompare(el, ctx) {
  const { data, locale } = ctx;
  const wanted = ctx.query.has('ids') ? ctx.query.get('ids').split(',').filter(Boolean) : data.athletes.map((a) => a.id);
  const chosen = data.athletes.filter((a) => wanted.includes(a.id));
  ctx.setMeta(['Compare', ...(chosen.length ? [chosen.map((a) => a.name).join(' vs ')] : [])], 'Compare athletes side by side.');
  el.innerHTML = html`
    <h1>Compare athletes</h1>
    <form class="filters" id="compare-pick" aria-label="Athletes to compare"><fieldset><legend>Pick two or more</legend>
      ${data.athletes.map((a) => html`<label class="check"><input type="checkbox" value="${a.id}" ${wanted.includes(a.id) ? 'checked' : ''}> ${athleteChip(a, false)}</label>`)}
    </fieldset></form>
    ${chosen.length < 2 ? notice('Select at least two athletes.') : html`
      <section aria-labelledby="h-totals"><h2 id="h-totals">Totals</h2>${totalsTable(chosen, locale)}</section>
      <section aria-labelledby="h-shared"><h2 id="h-shared">Shared events</h2>${sharedTable(chosen, data.events, locale)}</section>`}`;
  el.querySelector('#compare-pick').addEventListener('change', () => {
    const ids = [...el.querySelectorAll('#compare-pick input:checked')].map((input) => input.value);
    location.hash = `#/compare${ids.length ? `?ids=${ids.join(',')}` : ''}`;
  });
}
