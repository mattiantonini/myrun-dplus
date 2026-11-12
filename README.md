# my runD+

A small static site that shows the trail running races of one or more athletes: times,
rankings, maps, GPS tracks, elevation profiles, per-athlete stats and comparisons between
athletes who ran the same race.

Published at <https://mattiantonini.github.io/myrun-dplus/>.

- Plain HTML, CSS and vanilla JavaScript ES modules. **No build step, no framework, no `package.json`.**
- The only runtime dependency is [Leaflet 1.9.4](https://leafletjs.com), loaded from unpkg with SRI hashes.
- Everything the site shows lives in [`data/`](data/), one folder per athlete, and is read with `fetch()`.

> The repository ships with two fictional athletes ("Sample Runner A" and "Sample Runner B")
> and synthetic GPX tracks so that every view has something to show.
> See [Removing the sample data](#removing-the-sample-data).

## Run it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Opening `index.html` directly (`file://`) does not work:
browsers block `fetch()` and ES modules on `file://`, so the site cannot read `data/`.

## Views

| URL | View |
|---|---|
| `#/` | Home (all athletes). Opens the athlete directly when `defaultAthlete` is set or only one athlete exists. |
| `#/athletes` | Home, always (athlete cards, combined map, latest races, all races, club stats). |
| `#/a/<athlete>` | Athlete: totals, map, sortable and filterable races, stats, personal bests. |
| `#/a/<athlete>/race/<race>` | Race: key numbers, rankings, map with linked elevation profile, splits, GPS stats, notes, photos. |
| `#/event/<key>` | Event: every athlete who ran it, tracks overlaid, checkpoint-by-checkpoint gaps. |
| `#/compare?ids=a,b` | Compare two or more athletes: totals, shared events, head-to-head. |

Sorting and filters are kept in the URL (for example `#/a/mario-rossi?sort=km&dir=desc&year=2025`), so any view can be shared.

## Add an athlete

With the script:

```bash
node scripts/new-athlete.mjs mario-rossi "Mario Rossi"
```

It creates `data/athletes/mario-rossi/` (`athlete.json`, an empty `races.json`, `gpx/`) and
registers the id in `data/site.json`. Then edit `athlete.json` (bio, club, colour, links) and
optionally drop an `avatar.jpg` in the folder and set `"avatar": "avatar.jpg"`.

By hand: create the folder with the two JSON files described in the [data model](#data-model)
and add the folder name to `athletes` in `data/site.json` (GitHub Pages cannot list
directories, so this index is required).

## Add a race

With the script, from a GPX file:

```bash
node scripts/new-race.mjs mario-rossi ~/Downloads/lavaredo.gpx --id 2025-lavaredo-ultra-trail-80k
```

It copies the GPX to `data/athletes/mario-rossi/gpx/<race-id>.gpx`, reads the date, start
point, distance, D+ and elapsed time from it, and appends a pre-filled entry to `races.json`.
Then:

1. Open `races.json` and replace every `TODO` (name, place, country, status, ranking).
   The pre-filled `time` is the GPS elapsed time: replace it with the official time.
2. Replace the GPS distance and D+ with the official figures if you know them.
3. Add anything else you like (see the [race fields](#dataathletesidracesjson)).
4. Check and test:

```bash
node scripts/validate.mjs
```

```bash
node --test tests/
```

By hand: append an object to the athlete's `races.json`. Only `id`, `name`, `date` and
`status` are required; a race without a GPX file still gets a page.
`node scripts/validate.mjs --fix` fills `location.lat/lon` from the first GPX point (the
overview maps use those coordinates and never download GPX files).

### Linking the same race across athletes: `event`

Two athletes ran the same race when their entries have the **same `event` value**, for
example `"event": "lavaredo-ultra-trail-80k-2025"`. That is all it takes to get the
"Also ran this race" box, the shared-event icon, the `#/event/<key>` page and the
head-to-head on the compare page.

- `new-race.mjs` looks for a teammate's race on the same date starting within 5 km and
  prints the `event` key to reuse. Pass `--event <key>` to set it directly; name, course,
  place and official distance are then copied from the teammate's entry.
- Use one key per race *and* course *and* edition. The validator warns when one key has
  different dates or distances across athletes.

## Scripts and tests

Node 22.12 or newer, built-ins only (nothing to install).

| Command | What it does |
|---|---|
| `node scripts/validate.mjs` | Checks `data/`: `site.json` matches the folders, ids, required fields, dates, `HH:MM:SS`, status, rank ≤ total, referenced files exist, GPX files parse, leftover `TODO`s, inconsistent `event` keys. Exits non-zero on errors. |
| `node scripts/validate.mjs --fix` | Also syncs `site.json` with the folders and fills `location.lat/lon` from the GPX. |
| `node scripts/new-athlete.mjs <id> "<Full Name>"` | Creates and registers an athlete. |
| `node scripts/new-race.mjs <athlete-id> <gpx-path> [--id <slug>] [--event <key>]` | Adds a race from a GPX file. |
| `node --test tests/` | Unit tests for `js/gpx.js`, `js/format.js` and `js/data.js`. |

## Publish with GitHub Pages

1. Open <https://github.com/mattiantonini/myrun-dplus/settings/pages>.
2. Under **Build and deployment**, choose **Source: Deploy from a branch**.
3. Select branch **main** and folder **/ (root)**, then save.

There is no deploy workflow: Pages serves the repository as it is (the empty `.nojekyll`
file turns Jekyll off). Every push to `main` is live a minute or so later. The site is
served from `/myrun-dplus/`, which is why every URL in the code is relative.

## Data model

```
data/
├── site.json
└── athletes/<athlete-id>/          # kebab-case slug, e.g. "mario-rossi"
    ├── athlete.json
    ├── races.json
    ├── avatar.jpg                  # optional
    ├── gpx/<race-id>.gpx           # optional per race
    └── photos/<race-id>/…          # optional
```

### `data/site.json`

| Field | Meaning |
|---|---|
| `title` | Site name, shown in the header and in page titles. |
| `locale` | BCP 47 locale for dates and numbers, e.g. `it-IT`. |
| `defaultAthlete` | Athlete id that `#/` opens, or `null` for the home view. |
| `athletes` | Folder names under `data/athletes/`, in display order. |

### `data/athletes/<id>/athlete.json`

| Field | Meaning |
|---|---|
| `id` | Must equal the folder name. |
| `name` | Full name. |
| `bio`, `club` | Optional text. |
| `avatar` | Optional image path relative to the athlete folder. Initials are shown without it. |
| `color` | `#rrggbb` for markers, tracks and charts. Assigned automatically when missing. |
| `links` | Optional `strava`, `itra`, `utmb`, `instagram` URLs. |

### `data/athletes/<id>/races.json`

An array of races. Only `id`, `name`, `date` and `status` are required. Paths are relative
to the athlete folder.

```jsonc
{
  "id": "2025-lavaredo-ultra-trail-80k",    // unique within the athlete, kebab-case
  "event": "lavaredo-ultra-trail-80k-2025", // same value across athletes = same race
  "name": "Lavaredo Ultra Trail", "edition": 2025, "course": "80K",
  "date": "2025-06-27", "startTime": "2025-06-27T23:00:00+02:00",
  "location": { "place": "Cortina d'Ampezzo", "region": "Veneto", "country": "IT",
                "lat": 46.54, "lon": 12.14 },
  "distanceKm": 80, "elevationGainM": 4600, "elevationLossM": 4600,  // official figures
  "status": "finished",          // finished | dnf | dns | dq
  "time": "13:42:10",            // HH:MM:SS official elapsed time
  "dnfAtKm": null,               // km reached, for a DNF
  "ranking": { "overall": 312, "overallTotal": 1450, "gender": 280, "genderTotal": 1200,
               "category": 85, "categoryName": "M40", "categoryTotal": 300 },
  "itraPoints": 4, "itraScore": 520, "utmbIndex": 480, "utmbStones": 2,
  "bib": "1234",
  "type": "ultra",               // vk | sky | trail | ultra | other; inferred from km if missing
  "aid": [ { "name": "Ospitale", "km": 15.2, "time": "01:55:00" } ],  // time = elapsed at arrival
  "weather": "…", "gear": { "shoes": "…", "poles": true },
  "rating": 5, "notes": "Markdown-lite: paragraphs and **bold**", "tags": ["dolomites"],
  "links": { "results": "…", "strava": "…", "official": "…" },
  "gpx": "gpx/2025-lavaredo-ultra-trail-80k.gpx",
  "photos": [ { "src": "photos/2025-lavaredo-ultra-trail-80k/1.jpg", "caption": "…" } ]
}
```

Notes:

- `startTime` should carry the race's UTC offset (`+02:00`): the elevation profile then shows
  clock times in race-local time. Without it, the viewer's time zone is used.
- `location.lat/lon` place the race on the overview maps.
- A DNF counts `dnfAtKm` towards distance totals; its `time`, if given, is the time on course.
- Never stored, always derived when the site loads: seconds, pace, effort-km
  (km + D+ / 100) and pace per effort-km, ranking percentiles ("Top 22%"), inferred type,
  year, and resolved asset paths.

## Removing the sample data

Everything fictional is tagged `"sample"` and lives in two folders:

```bash
rm -r data/athletes/sample-runner-a data/athletes/sample-runner-b
```

```bash
node scripts/validate.mjs --fix
```

The second command removes the two ids from `data/site.json`. One test
(`the sample data loads…` in `tests/data.test.mjs`) and one in `tests/gpx.test.mjs`
(`sample GPX files parse…`) read the sample files: delete those two tests as well.

## Privacy

**Everything in `data/` is public** once the site is published: names, results, photos,
and GPS tracks with timestamps (which can reveal where someone lives or trains, and heart
rate if the file contains it). Publish an athlete's results and tracks **only with their
consent**, and remove their folder (and run `validate.mjs --fix`) if they ask. Keep in mind
that a public git history keeps deleted files; rewrite the history if something must truly go.

## Project layout

```
index.html            page shell, Leaflet tags with SRI
css/style.css         mobile-first styles, light and dark
js/app.js             hash router and bootstrap
js/data.js            loading of data/ and every derived value (pure, tested)
js/format.js          formatting and parsing helpers (pure, tested)
js/gpx.js             GPX parsing and track maths (pure, tested)
js/ui.js              safe HTML templates, race table, bar charts, small components
js/map.js             Leaflet maps
js/profile.js         SVG elevation profile
js/views/*.js         home, athlete, race, event, compare
scripts/*.mjs         validate, new-athlete, new-race
tests/*.test.mjs      node:test unit tests
```

## Credits and licences

- [Leaflet](https://leafletjs.com) 1.9.4, BSD 2-Clause licence.
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL.
  Please respect the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- Topographic tiles © [OpenTopoMap](https://opentopomap.org) (CC-BY-SA), elevation data SRTM.
- The sample athletes, races and GPX tracks are synthetic. Their coordinates lie in the Alps
  but the routes, names and results are invented.
