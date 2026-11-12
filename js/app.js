/** Entry point: loads the data once, then routes `#/…` hashes to views. */
import { loadData } from './data.js';
import { disposeMaps } from './map.js';
import { esc, html, installTooltips, notice } from './ui.js';
import { renderHome } from './views/home.js';
import { renderAthlete } from './views/athlete.js';
import { renderRace } from './views/race.js';
import { renderEvent } from './views/event.js';
import { renderCompare } from './views/compare.js';

const main = document.getElementById('main');
const brandHtml = (title) => esc(title).replace('D+', '<b class="dplus">D+</b>');
let data = null;
let renderId = 0;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function parseHash() {
  const [path, search = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { segments: path.split('/').filter(Boolean).map(decodeURIComponent), path, query: new URLSearchParams(search) };
}

function setMeta(parts, description) {
  const title = [data?.site.title ?? 'my runD+', ...parts].join(' · ');
  document.title = title;
  const set = (selector, value) => document.querySelector(selector)?.setAttribute('content', value);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', description);
  set('meta[name="description"]', description);
}

/** Pick the view for the current hash; unknown routes return null. */
function route(segments) {
  const [a, b, c, d] = segments;
  if (!a) {
    const only = data.site.defaultAthlete ?? (data.athletes.length === 1 && !data.errors.length ? data.athletes[0].id : null);
    return only && data.athlete(only) ? (el, ctx) => renderAthlete(el, ctx, only) : renderHome;
  }
  if (a === 'athletes' && !b) return renderHome;
  if (a === 'a' && b && !c) return (el, ctx) => renderAthlete(el, ctx, b);
  if (a === 'a' && c === 'race' && d) return (el, ctx) => renderRace(el, ctx, b, d);
  if (a === 'event' && b) return (el, ctx) => renderEvent(el, ctx, b);
  if (a === 'compare') return renderCompare;
  return null;
}

async function render() {
  const id = ++renderId;
  const { segments, path, query } = parseHash();
  disposeMaps();
  const ctx = {
    data,
    locale: data.site.locale,
    query,
    setMeta,
    /** False once the user has navigated away (checked after awaits). */
    alive: () => id === renderId,
    /** Update the hash query in place (no re-render) so the current view state can be shared. */
    setQuery(patch) {
      for (const [key, value] of Object.entries(patch)) (value ? query.set(key, value) : query.delete(key));
      const search = query.toString();
      history.replaceState(null, '', `#/${path}${search ? `?${search}` : ''}`);
    },
  };
  const view = route(segments);
  try {
    if (!view) throw new Error('Page not found.');
    await view(main, ctx);
  } catch (error) {
    if (!ctx.alive()) return;
    setMeta(['Not found'], 'Trail running race log');
    main.innerHTML = html`<h1>Nothing here</h1>${notice(error.message, 'error')}<p><a href="#/">Back to the start</a></p>`;
  }
  if (ctx.alive()) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

async function start() {
  installTooltips();
  try {
    data = await loadData(fetchJson);
  } catch (error) {
    main.innerHTML = html`<h1>Could not load the race log</h1>
      ${notice(error.message, 'error')}
      <p>The site reads <code>data/site.json</code> with <code>fetch()</code>, which browsers block on <code>file://</code>.
      Serve the folder instead: <code>python3 -m http.server 8000</code>.</p>`;
    return;
  }
  document.documentElement.lang = 'en';
  document.querySelector('.brand').innerHTML = brandHtml(data.site.title);
  window.addEventListener('hashchange', render);
  render();
}

start();
