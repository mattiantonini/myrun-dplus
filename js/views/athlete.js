/** Athlete page: profile, summary tiles, overview map, race list and stats. */
import { perYear, personalBests } from '../data.js';
import { formatHours, formatKm, formatNumber, formatPace, formatRank, flag } from '../format.js';
import { overviewMap } from '../map.js';
import { avatar, html, raceTable, tiles, TYPE_LABEL, yearCharts } from '../ui.js';
import { racePopup } from './home.js';

const LINK_LABEL = { strava: 'Strava', itra: 'ITRA', utmb: 'UTMB', instagram: 'Instagram' };
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : null);

function bestsTable(races, locale) {
  const bests = personalBests(races);
  if (!bests.length) return '';
  const link = (race, text) => (race ? html`<a href="${race.href}">${race.title}</a> <span class="muted">${text}</span>` : '–');
  return html`<h3>Personal bests by type</h3>
    <div class="table-wrap"><table class="simple">
      <thead><tr><th scope="col">Type</th><th scope="col">Best effort pace</th><th scope="col">Longest</th><th scope="col">Best ranking</th></tr></thead>
      <tbody>${bests.map((pb) => html`<tr>
        <th scope="row">${TYPE_LABEL[pb.type]} <span class="muted">× ${pb.count}</span></th>
        <td>${link(pb.fastest, pb.fastest && formatPace(pb.fastest.effortPace))}</td>
        <td>${link(pb.longest, pb.longest && formatKm(pb.longest.distanceKm, locale))}</td>
        <td>${link(pb.bestRank, pb.bestRank && formatRank(pb.bestRank.ranking.overall, pb.bestRank.ranking.overallTotal))}</td>
      </tr>`)}</tbody></table></div>
    <p class="muted small">Effort pace = time ÷ effort-km, where effort-km = km + D+ ÷ 100.</p>`;
}

/** Render the athlete view; throws when the athlete does not exist. */
export function renderAthlete(el, ctx, athleteId) {
  const { data, locale } = ctx;
  const athlete = data.athlete(athleteId);
  if (!athlete) throw new Error(`Athlete "${athleteId}" was not found.`);
  const t = athlete.totals;
  const links = Object.entries(athlete.links ?? {}).filter(([, url]) => safeUrl(url));
  ctx.setMeta([athlete.name], `${athlete.name}: ${t.races} trail races, ${formatKm(t.km, locale, 0)} and ${formatNumber(t.gainM, locale)} m D+.`);
  el.innerHTML = html`
    <header class="profile-head" style="--c:${athlete.color}">
      ${avatar(athlete, 'avatar-lg')}
      <div>
        <h1>${athlete.name}</h1>
        ${athlete.club ? html`<p class="muted">${athlete.club}</p>` : ''}
        ${athlete.bio ? html`<p>${athlete.bio}</p>` : ''}
        ${links.length ? html`<p class="links">${links.map(([key, url]) => html`<a href="${url}" rel="noopener">${LINK_LABEL[key] ?? key}</a>`)}</p>` : ''}
      </div>
    </header>
    ${tiles([
    ['Races', t.races], ['Finishes', t.finishes], ['DNFs', t.dnfs],
    ['Distance', formatKm(t.km, locale, 0)], ['Elevation gain', `${formatNumber(t.gainM, locale)} m`],
    ['Time on course', formatHours(t.seconds)],
    ['Countries', t.countries.length, t.countries.map(flag).join(' ')],
  ])}
    <section aria-labelledby="h-map"><h2 id="h-map">Map</h2><div class="map map-overview" id="athlete-map"></div></section>
    <section aria-labelledby="h-races"><h2 id="h-races">Races</h2><div id="athlete-table"></div></section>
    <section aria-labelledby="h-stats"><h2 id="h-stats">Stats</h2>
      ${yearCharts([athlete], perYear, locale)}
      ${bestsTable(athlete.races, locale)}
    </section>`;
  overviewMap(el.querySelector('#athlete-map'), athlete.races, (race) => racePopup(race, locale));
  raceTable(el.querySelector('#athlete-table'), athlete.races, ctx);
}
