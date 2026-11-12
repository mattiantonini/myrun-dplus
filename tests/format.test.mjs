import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../js/format.js';

test('parseHms accepts HH:MM:SS (hours may exceed 23) and rejects the rest', () => {
  assert.equal(f.parseHms('13:42:10'), 49330);
  assert.equal(f.parseHms('00:58:40'), 3520);
  assert.equal(f.parseHms('46:05:00'), 165900);
  for (const bad of ['13:42', '1:60:00', '01:02:75', 'TODO', '', null, undefined]) assert.equal(f.parseHms(bad), null);
});

test('durations, paces and gaps', () => {
  assert.equal(f.formatDuration(49330), '13:42:10');
  assert.equal(f.formatDuration(59.6), '0:01:00');
  assert.equal(f.formatDuration(null), '–');
  assert.equal(f.formatHours(49330), '13 h 42 m');
  assert.equal(f.formatPace(616.6), '10:17 /km');
  assert.equal(f.formatPace(0), '–');
  assert.equal(f.formatPace(Infinity), '–');
  assert.equal(f.formatGap(0), '–');
  assert.equal(f.formatGap(130), '+2:10');
  assert.equal(f.formatGap(3725), '+1:02:05');
  assert.equal(f.formatGap(-45), '−0:45');
});

test('percentiles and rank labels', () => {
  assert.equal(f.percentile(312, 1450), 22);
  assert.equal(f.percentile(1, 1450), 1);
  assert.equal(f.percentile(1450, 1450), 100);
  assert.equal(f.percentile(10, 5), null);
  assert.equal(f.percentile(undefined, 100), null);
  assert.equal(f.formatRank(312, 1450), '312 / 1450 · Top 22%');
  assert.equal(f.formatRank(312), '312');
  assert.equal(f.formatRank(null, 10), '–');
});

test('numbers and dates follow the locale', () => {
  assert.equal(f.formatKm(42.195, 'en-GB'), '42.2 km');
  assert.equal(f.formatKm(undefined, 'en-GB'), '–');
  assert.equal(f.formatM(4600, 'en-GB'), '4,600 m');
  assert.equal(f.formatM(14600, 'it-IT'), '14.600 m');
  assert.equal(f.formatDate('2025-06-27', 'en-GB'), '27 Jun 2025');
  assert.match(f.formatDate('2025-06-27', 'it-IT'), /27 giu 2025/);
  assert.equal(f.formatDate('nope', 'en-GB'), '–');
});

test('clock times use the offset written in startTime', () => {
  const ms = Date.parse('2025-06-27T23:00:00+02:00');
  assert.equal(f.isoOffsetMinutes('2025-06-27T23:00:00+02:00'), 120);
  assert.equal(f.isoOffsetMinutes('2025-06-27T21:00:00Z'), 0);
  assert.equal(f.isoOffsetMinutes('2025-06-27T21:00:00-03:30'), -210);
  assert.equal(f.isoOffsetMinutes('2025-06-27T21:00:00'), null);
  assert.equal(f.formatClock(ms, 'en-GB', 120), '23:00');
  assert.equal(f.formatClock(ms, 'en-GB', 0), '21:00');
});

test('flag, initials and slugify', () => {
  assert.equal(f.flag('IT'), '🇮🇹');
  assert.equal(f.flag('ch'), '🇨🇭');
  assert.equal(f.flag('Italy'), '');
  assert.equal(f.flag(undefined), '');
  assert.equal(f.initials('Mario Rossi'), 'MR');
  assert.equal(f.initials('Anna Maria De Luca'), 'AL');
  assert.equal(f.initials('Cher'), 'C');
  assert.equal(f.initials(''), '?');
  assert.equal(f.slugify("Lavaredo Ultra Trail — Cortina d'Ampezzo 80K"), 'lavaredo-ultra-trail-cortina-d-ampezzo-80k');
  assert.equal(f.slugify('Tröllaskagi Última'), 'trollaskagi-ultima');
});
