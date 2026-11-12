/** Pure formatting and parsing helpers (no DOM). */

const DASH = '–';

/** Parse "HH:MM:SS" (hours may exceed 23) into seconds, or null if malformed. */
export function parseHms(text) {
  const m = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(text ?? '');
  return m ? m[1] * 3600 + m[2] * 60 + +m[3] : null;
}

/** Format seconds as "H:MM:SS". */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return DASH;
  const s = Math.round(Math.abs(seconds));
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Format a long duration as "12 h 05 m" (for totals). */
export function formatHours(seconds) {
  if (!Number.isFinite(seconds)) return DASH;
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
}

/** Format a pace given in seconds per km as "M:SS /km". */
export function formatPace(secPerKm) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return DASH;
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
}

/** Format a time gap in seconds as "+M:SS" or "+H:MM:SS"; zero gives "–". */
export function formatGap(seconds) {
  if (!Number.isFinite(seconds)) return DASH;
  if (Math.round(seconds) === 0) return DASH;
  const s = Math.round(Math.abs(seconds));
  const sign = seconds < 0 ? '−' : '+';
  const mmss = `${Math.floor((s % 3600) / 60)}:${String(s % 60).padStart(2, '0')}`;
  return s >= 3600 ? `${sign}${Math.floor(s / 3600)}:${mmss.padStart(5, '0')}` : sign + mmss;
}

/** Format a number with the locale's separators, or a dash when missing. */
export function formatNumber(value, locale, digits = 0) {
  if (!Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

/** "42.2 km" */
export function formatKm(km, locale, digits = 1) {
  return Number.isFinite(km) ? `${formatNumber(km, locale, digits)} km` : DASH;
}

/** "4,600 m" */
export function formatM(m, locale) {
  return Number.isFinite(m) ? `${formatNumber(Math.round(m), locale)} m` : DASH;
}

/** Format an ISO date ("2025-06-27") without time-zone drift. */
export function formatDate(iso, locale, style = 'medium') {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(d);
}

/** Format a timestamp (ms) as a clock time, optionally in a fixed UTC offset in minutes. */
export function formatClock(ms, locale, offsetMin = null) {
  if (!Number.isFinite(ms)) return DASH;
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (offsetMin === null) return new Intl.DateTimeFormat(locale, opts).format(ms);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(ms + offsetMin * 60000);
}

/** UTC offset in minutes written in an ISO date-time ("…+02:00"), or null. */
export function isoOffsetMinutes(iso) {
  const m = /(Z|[+-]\d{2}:\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  if (m[1] === 'Z') return 0;
  const [h, min] = m[1].slice(1).split(':').map(Number);
  return (m[1][0] === '-' ? -1 : 1) * (h * 60 + min);
}

/** Percentile of a rank ("Top 22%"), rounded up; null when not computable. */
export function percentile(rank, total) {
  if (!(rank > 0) || !(total > 0) || rank > total) return null;
  return Math.max(1, Math.ceil((rank / total) * 100));
}

/** "312 / 1450 · Top 22%" (degrades to "312" or a dash). */
export function formatRank(rank, total) {
  if (!(rank > 0)) return DASH;
  const pct = percentile(rank, total);
  return pct === null ? String(rank) : `${rank} / ${total} · Top ${pct}%`;
}

/** Emoji flag for an ISO 3166-1 alpha-2 country code ("IT" → 🇮🇹). */
export function flag(country) {
  if (!/^[A-Za-z]{2}$/.test(country ?? '')) return '';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** Up to two initials from a full name. */
export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

/** Lower-case kebab-case slug of any text. */
export function slugify(text) {
  return String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
