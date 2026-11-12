/** Shared rendering helpers: safe HTML templates, small components, tables and bar charts. */
import { filterRaces, sortRaces, facets } from './data.js';
import { formatDate, formatDuration, formatM, formatNumber, formatPace, formatRank, flag, initials } from './format.js';

class Safe {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

/** Escape text for use in HTML content and attribute values. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Mark a string as already-safe HTML. */
export const raw = (text) => new Safe(String(text));

/** Tagged template that escapes every interpolation except nested `html`/`raw` values and arrays of them. */
export function html(strings, ...values) {
  const show = (v) => {
    if (v === null || v === undefined || v === false) return '';
    if (v instanceof Safe) return v.text;
    return Array.isArray(v) ? v.map(show).join('') : esc(v);
  };
  return new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? show(values[i]) : ''), ''));
}

export const STATUS_LABEL = { finished: 'Finished', dnf: 'DNF', dns: 'DNS', dq: 'DQ' };
export const TYPE_LABEL = { vk: 'Vertical', sky: 'Sky', trail: 'Trail', ultra: 'Ultra', other: 'Other' };

/** Status badge: an icon plus a label, so state never relies on colour alone. */
export function statusBadge(status) {
  const icon = status === 'finished' ? '✓' : status === 'dns' ? '○' : '✕';
  return html`<span class="badge badge-${status}"><span aria-hidden="true">${icon}</span> ${STATUS_LABEL[status] ?? status}</span>`;
}

/** Athlete avatar: the image when present, otherwise initials on the athlete colour. */
export function avatar(athlete, size = '') {
  const style = `--c:${athlete.color}`;
  if (athlete.avatarUrl) {
    return html`<img class="avatar ${size}" style="${style}" src="${athlete.avatarUrl}" alt="${athlete.name}" width="64" height="64">`;
  }
  return html`<span class="avatar ${size}" style="${style}" role="img" aria-label="${athlete.name}">${initials(athlete.name)}</span>`;
}

/** Small coloured dot followed by the athlete name. */
export function athleteChip(athlete, link = true) {
  const dot = html`<span class="dot" style="--c:${athlete.color}"></span>`;
  return link ? html`<a class="chip" href="${athlete.href}">${dot}${athlete.name}</a>` : html`<span class="chip">${dot}${athlete.name}</span>`;
}

/** Grid of summary tiles from `[label, value, hint?]` rows (rows with a nullish value are skipped). */
export function tiles(rows) {
  return html`<dl class="tiles">${rows.filter((r) => r[1] !== null && r[1] !== undefined && r[1] !== '–').map(([label, value, hint]) => html`
    <div class="tile"><dt>${label}</dt><dd>${value}${hint ? html`<small>${hint}</small>` : ''}</dd></div>`)}</dl>`;
}

/** Message panel for empty, loading and error states. */
export function notice(text, kind = 'info') {
  return html`<p class="notice notice-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${text}</p>`;
}

/** Finish time, or the status when there is none ("DNF km 38"). */
export function resultText(race) {
  if (race.finished) return race.seconds ? formatDuration(race.seconds) : '–';
  const at = race.status === 'dnf' && race.coveredKm ? ` km ${race.coveredKm}` : '';
  return `${STATUS_LABEL[race.status] ?? race.status}${at}`;
}

const COLUMNS = [
  { key: 'date', label: 'Date', cell: (r, l) => formatDate(r.date, l) },
  { key: 'athlete', label: 'Athlete', cell: (r) => athleteChip(r.athlete) },
  { key: 'name', label: 'Race', cell: (r) => html`<a class="race-link" href="${r.href}">${r.name ?? r.id}</a>
      ${r.course ? html`<span class="muted">${r.course}</span>` : ''}
      ${r.shared ? html`<a class="shared" href="#/event/${encodeURIComponent(r.event)}" title="Shared event: compare athletes" aria-label="Shared event: compare athletes">👥</a>` : ''}` },
  { label: 'Country', cell: (r) => (r.location?.country
    ? html`<span title="${r.location.place ?? r.location.country}">${flag(r.location.country)} <span class="muted">${r.location.country}</span></span>` : '–') },
  { key: 'km', label: 'km', num: true, cell: (r, l) => formatNumber(r.distanceKm, l, 1) },
  { key: 'gain', label: 'D+', num: true, cell: (r, l) => formatM(r.elevationGainM, l) },
  { key: 'time', label: 'Time', num: true, cell: (r) => (r.finished ? resultText(r) : '–') },
  { key: 'pace', label: 'Pace', num: true, cell: (r) => (r.finished ? formatPace(r.pace) : '–') },
  { key: 'rank', label: 'Overall', cell: (r) => formatRank(r.ranking?.overall, r.ranking?.overallTotal) },
  { label: 'Status', cell: (r) => html`${statusBadge(r.status)}${r.status === 'dnf' && r.coveredKm ? html` <span class="muted">km ${r.coveredKm}</span>` : ''}` },
];
const FILTERS = [['year', 'Year'], ['type', 'Type'], ['country', 'Country'], ['status', 'Status']];
const optionLabel = (name, value) => (name === 'type' ? TYPE_LABEL[value] : name === 'status' ? STATUS_LABEL[value]
  : name === 'country' ? `${flag(value)} ${value}` : value);

/**
 * Sortable, filterable race list: a table on desktop that collapses to cards on mobile.
 * Sort and filters live in the hash query so the view can be shared.
 * @param {HTMLElement} el container
 * @param {object[]} races derived races
 * @param {object} ctx view context (`locale`, `query`, `setQuery`)
 * @param {{athletes?:object[]}} [options] pass athletes to add the athlete column and filter
 */
export function raceTable(el, races, ctx, { athletes = null } = {}) {
  const columns = COLUMNS.filter((c) => athletes || c.key !== 'athlete');
  const options = facets(races);
  const q = ctx.query;
  const select = (name, label, values) => html`<label>${label}
    <select name="${name}"><option value="">All</option>${values.map(([value, text]) => html`
      <option value="${value}" ${q.get(name) === String(value) ? raw('selected') : ''}>${text}</option>`)}</select></label>`;
  el.innerHTML = html`
    <form class="filters" role="search" aria-label="Filter races">
      <label class="grow">Search <input type="search" name="q" value="${q.get('q') ?? ''}" placeholder="Race, place, tag…"></label>
      ${athletes ? select('athlete', 'Athlete', athletes.map((a) => [a.id, a.name])) : ''}
      ${FILTERS.map(([name, label]) => select(name, label, options[name].map((v) => [v, optionLabel(name, v)])))}
      <label class="only-cards">Sort by <select name="sort">${columns.filter((c) => c.key).map((c) => html`
        <option value="${c.key}" ${(q.get('sort') ?? 'date') === c.key ? raw('selected') : ''}>${c.label}</option>`)}</select></label>
    </form>
    <div class="table-wrap"></div>`;
  const wrap = el.querySelector('.table-wrap');

  const draw = () => {
    const sort = q.get('sort') ?? 'date';
    const dir = q.get('dir') ?? (sort === 'date' ? 'desc' : 'asc');
    const rows = sortRaces(filterRaces(races, Object.fromEntries(q)), sort, dir);
    wrap.innerHTML = html`
      <p class="muted count" role="status">${rows.length} of ${races.length} races</p>
      <table class="races">
        <thead><tr>${columns.map((c) => (c.key ? html`
          <th scope="col" class="${c.num ? 'num' : ''}" aria-sort="${sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
            <button type="button" data-sort="${c.key}">${c.label}<span aria-hidden="true">${sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button></th>`
          : html`<th scope="col">${c.label}</th>`))}</tr></thead>
        <tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`
          <td class="${c.num ? 'num' : ''} col-${c.key ?? c.label.toLowerCase()}" data-label="${c.label}">${c.cell(r, ctx.locale)}</td>`)}</tr>`)}</tbody>
      </table>
      ${rows.length ? '' : notice('No races match these filters.')}`;
  };

  el.querySelector('form').addEventListener('input', (event) => {
    ctx.setQuery({ [event.target.name]: event.target.value });
    draw();
  });
  el.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
  wrap.addEventListener('click', (event) => {
    const key = event.target.closest('[data-sort]')?.dataset.sort;
    if (!key) return;
    const current = q.get('sort') ?? 'date';
    const dir = q.get('dir') ?? (current === 'date' ? 'desc' : 'asc');
    ctx.setQuery({ sort: key, dir: current === key && dir === 'asc' ? 'desc' : 'asc' });
    draw();
    wrap.querySelector(`[data-sort="${key}"]`)?.focus();
  });
  draw();
}

/**
 * Grouped bar chart as inline SVG (one y axis, bars anchored to the baseline).
 * @param {{title:string, unit:string, groups:(string|number)[], series:{name:string, color:string, values:number[]}[], locale:string}} spec
 */
export function barChart({ title, unit, groups, series, locale }) {
  const [W, H, left, top, bottom] = [360, 190, 8, 22, 22];
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const plotH = H - top - bottom;
  const groupW = (W - left * 2) / Math.max(1, groups.length);
  const barW = Math.min(34, (groupW - 14) / series.length - 2);
  const labelled = groups.length * series.length <= 10;
  const bars = groups.flatMap((group, g) => series.map((s, i) => {
    const value = s.values[g] ?? 0;
    const h = Math.max(value > 0 ? 2 : 0, (value / max) * plotH);
    const x = left + g * groupW + (groupW - series.length * (barW + 2)) / 2 + i * (barW + 2) + 1;
    const y = top + plotH - h;
    const r = Math.min(4, h, barW / 2);
    const text = `${formatNumber(value, locale)} ${unit}`;
    return html`<g data-tip="${s.name} · ${group}: ${text}">
      <path d="M${x},${y + h}V${y + r}q0,${-r} ${r},${-r}h${barW - 2 * r}q${r},0 ${r},${r}V${y + h}z" fill="${s.color}"/>
      <rect x="${x - 1}" y="${top}" width="${barW + 2}" height="${plotH}" fill="transparent"/>
      ${labelled && value > 0 ? html`<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" class="bar-value">${formatNumber(value, locale)}</text>` : ''}</g>`;
  }));
  const summary = series.map((s) => `${s.name}: ${groups.map((g, i) => `${g} ${formatNumber(s.values[i] ?? 0, locale)} ${unit}`).join(', ')}`).join('; ');
  return html`<figure class="chart">
    <figcaption>${title} <span class="muted">(${unit})</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}. ${summary}">
      <line x1="${left}" x2="${W - left}" y1="${top + plotH + 0.5}" y2="${top + plotH + 0.5}" class="axis"/>
      ${bars}
      ${groups.map((group, g) => html`<text x="${left + (g + 0.5) * groupW}" y="${H - 6}" text-anchor="middle" class="tick">${group}</text>`)}
    </svg>
    ${series.length > 1 ? html`<p class="legend">${series.map((s) => html`<span class="chip"><span class="dot" style="--c:${s.color}"></span>${s.name}</span>`)}</p>` : ''}
  </figure>`;
}

/** Km and D+ per year for one or more athletes, as two single-axis charts. */
export function yearCharts(athletes, perYearOf, locale) {
  const stats = athletes.map((a) => perYearOf(a.races));
  const years = [...new Set(stats.flatMap((m) => [...m.keys()]))].sort();
  if (!years.length) return notice('No races yet.');
  const chart = (title, unit, pick) => barChart({
    title, unit, locale, groups: years,
    series: athletes.map((a, i) => ({ name: a.name, color: a.color, values: years.map((y) => Math.round(pick(stats[i].get(y)) ?? 0)) })),
  });
  return html`<div class="charts">${chart('Distance per year', 'km', (y) => y?.km)}${chart('Elevation gain per year', 'm D+', (y) => y?.gainM)}</div>`;
}

/** Wire one floating tooltip for every `[data-tip]` element in the document. */
export function installTooltips() {
  const tip = Object.assign(document.createElement('div'), { className: 'tooltip', hidden: true });
  document.body.append(tip);
  document.addEventListener('pointermove', (event) => {
    const target = event.target.closest?.('[data-tip]');
    tip.hidden = !target;
    if (!target) return;
    tip.textContent = target.dataset.tip;
    tip.style.left = `${Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${event.clientY + 16}px`;
  });
}
