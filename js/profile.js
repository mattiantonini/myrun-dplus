/** Interactive SVG elevation profile, linked to the map through `onHover` / `highlight`. */
import { downsample, pointAtDistance } from './gpx.js';
import { formatClock, formatDuration, formatNumber } from './format.js';
import { html, notice } from './ui.js';

const H = 220;
const PAD = { left: 44, right: 10, top: 14, bottom: 24 };

function niceStep(span, target) {
  const rough = span / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough);
}

/**
 * Render the profile into `el`.
 * @param {HTMLElement} el
 * @param {object} track parsed GPX track
 * @param {{locale:string, color:string, offsetMin?:number|null, aid?:{name:string, km:number}[],
 *   onHover?:(point:object|null) => void}} options
 * @returns {{highlight:(km:number|null) => void}} `highlight` moves the cursor from outside (map hover)
 */
export function renderProfile(el, track, { locale, color, offsetMin = null, aid = [], onHover = null }) {
  if (track.maxEle === null) {
    el.innerHTML = notice('This GPX file has no elevation data, so there is no profile.');
    return { highlight() {} };
  }
  const points = downsample(track.points.filter((p) => p.ele !== null));
  const total = track.distanceKm;
  let width = 0;
  let cursor = null;

  const draw = () => {
    width = Math.max(280, el.clientWidth);
    const plotW = width - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const stepY = niceStep(Math.max(50, track.maxEle - track.minEle), 4);
    const lo = Math.floor(track.minEle / stepY) * stepY;
    const hi = Math.ceil(track.maxEle / stepY) * stepY || lo + stepY;
    const x = (km) => PAD.left + (km / total) * plotW;
    const y = (ele) => PAD.top + (1 - (ele - lo) / (hi - lo)) * plotH;
    const line = points.map((p) => `${x(p.dist).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' L');
    const stepX = niceStep(total, Math.max(3, Math.floor(plotW / 70)));
    const ticksX = Array.from({ length: Math.floor(total / stepX) + 1 }, (_, i) => i * stepX);
    const ticksY = Array.from({ length: Math.round((hi - lo) / stepY) + 1 }, (_, i) => lo + i * stepY);
    const base = PAD.top + plotH;
    el.innerHTML = html`
      <p class="profile-readout" aria-live="polite">Hover, tap or use ← → on the profile to inspect a point.</p>
      <svg class="profile" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" tabindex="0" role="img" style="--c:${color}"
        aria-label="Elevation profile: ${formatNumber(total, locale, 1)} km, from ${Math.round(track.minEle)} m to ${Math.round(track.maxEle)} m">
        ${ticksY.map((t) => html`<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(t)}" y2="${y(t)}"/>
          <text class="tick" x="${PAD.left - 6}" y="${y(t) + 4}" text-anchor="end">${formatNumber(t, locale)}</text>`)}
        ${ticksX.map((t) => html`<text class="tick" x="${x(t)}" y="${H - 6}" text-anchor="middle">${t}${t === ticksX.at(-1) ? ' km' : ''}</text>`)}
        <path class="area" d="M${PAD.left},${base} L${line} L${x(points.at(-1).dist).toFixed(1)},${base} Z"/>
        <path class="line" d="M${line}"/>
        ${aid.filter((a) => a.km > 0 && a.km <= total).map((a) => html`<g class="aid">
          <line x1="${x(a.km)}" x2="${x(a.km)}" y1="${PAD.top}" y2="${base}"/><title>${a.name} · km ${a.km}</title>
          <text x="${x(a.km)}" y="${PAD.top - 3}" text-anchor="middle">✚</text></g>`)}
        <g class="cursor" hidden><line y1="${PAD.top}" y2="${base}"/><circle r="5"/></g>
      </svg>`;
    cursor = { x, y, node: el.querySelector('.cursor'), readout: el.querySelector('.profile-readout'), plotW };
  };

  const show = (km, notify) => {
    if (km === null) {
      cursor.node.setAttribute('hidden', '');
      if (notify) onHover?.(null);
      return;
    }
    const p = pointAtDistance(track, Math.min(total, Math.max(0, km)));
    cursor.km = p.dist;
    cursor.node.removeAttribute('hidden');
    cursor.node.querySelector('line').setAttribute('x1', cursor.x(p.dist));
    cursor.node.querySelector('line').setAttribute('x2', cursor.x(p.dist));
    cursor.node.querySelector('circle').setAttribute('cx', cursor.x(p.dist));
    cursor.node.querySelector('circle').setAttribute('cy', cursor.y(p.ele ?? track.minEle));
    const parts = [`km ${formatNumber(p.dist, locale, 1)}`, p.ele === null ? null : `${formatNumber(Math.round(p.ele), locale)} m`];
    if (p.time !== null && track.startTime !== null) {
      parts.push(`🕑 ${formatClock(p.time, locale, offsetMin)}`, `${formatDuration((p.time - track.startTime) / 1000)} elapsed`);
    }
    cursor.readout.textContent = parts.filter(Boolean).join(' · ');
    if (notify) onHover?.(p);
  };

  const fromPointer = (event) => {
    const rect = el.querySelector('svg').getBoundingClientRect();
    show(((event.clientX - rect.left - PAD.left) / cursor.plotW) * total, true);
  };
  el.addEventListener('pointermove', (event) => event.target.closest('svg') && fromPointer(event));
  el.addEventListener('pointerdown', (event) => event.target.closest('svg') && fromPointer(event));
  el.addEventListener('pointerleave', (event) => event.pointerType === 'mouse' && show(null, true));
  el.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    show((cursor.km ?? 0) + step * Math.max(0.1, total / 100), true);
  });
  new ResizeObserver(() => el.isConnected && Math.max(280, el.clientWidth) !== width && draw()).observe(el);
  draw();
  return { highlight: (km) => show(km, false) };
}
