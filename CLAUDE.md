# my runD+ — guidance for Claude Code sessions

Static trail running race log for several athletes, published with GitHub Pages at
`https://mattiantonini.github.io/myrun-dplus/`. See README.md for the full data model.

## Hard constraints (do not break)

1. No build step, bundler, framework, `package.json` or `npm install`. Plain HTML, CSS and vanilla ES modules.
2. The only runtime dependency is Leaflet 1.9.4 from unpkg, pinned, with SRI hashes (in `index.html`). GPX parsing, charts, sorting, filtering and routing are hand-written.
3. All persistence is in `data/`, one folder per athlete: `data/athletes/<athlete-id>/`. The site only reads it with `fetch()`.
4. Relative URLs only (the site is served from `/myrun-dplus/`).
5. Pages deploys from branch `main`, folder `/`. Keep `.nojekyll`. No GitHub Actions deploy workflow.
6. Dev tooling uses Node built-ins only, run with plain `node`.
7. Small readable modules, JSDoc on exported functions, no dead code, about 2,000 lines of JS.

## Data contract

- `data/site.json`: `{ title, locale, defaultAthlete, athletes: [folder names in display order] }`.
- `data/athletes/<id>/athlete.json`: `id` (= folder name), `name`, optional `bio`, `club`, `avatar`, `color`, `links`.
- `data/athletes/<id>/races.json`: array. Required per race: `id`, `name`, `date` (YYYY-MM-DD), `status` (`finished | dnf | dns | dq`). Everything else is optional and the UI must degrade without it. Paths (`gpx`, `photos[].src`) are relative to the athlete folder.
- `event`: the same value in two athletes' races means the same race. It drives the event page, "Also ran this race" and compare.
- Derived values (seconds, pace, effort-km, percentiles, inferred type, year, resolved paths) are computed in `js/data.js` at load time. **Never store them in JSON.**
- Home and athlete maps use `location.lat/lon` only. GPX files are fetched only by the race and event views.

## Recipe: add an athlete

```bash
node scripts/new-athlete.mjs <id> "<Full Name>"
```

Then fill in `athlete.json`. `<id>` is a kebab-case slug such as `mario-rossi`.

## Recipe: add a race (given a GPX file and a few facts)

1. Run the script (it copies the GPX into `data/athletes/<id>/gpx/<race-id>.gpx`):
   ```bash
   node scripts/new-race.mjs <athlete-id> <gpx-path> --id <yyyy-race-name-course>
   ```
2. In `races.json`, fill in the facts the user gave (official `time`, `status`, `ranking`, name, course, place, country) and replace every `TODO`. The pre-filled `time` is only the GPS elapsed time. Prefer official distance and D+ over the GPS values when known. Add `startTime` with the UTC offset (`2025-06-27T23:00:00+02:00`) if the start time is known.
3. Reuse a teammate's `event` key when they ran the same race: the script prints a suggestion (same date, start within 5 km), or pass `--event <key>` up front. Otherwise invent one as `<race-name>-<course>-<year>`.
4. Do not invent results: leave unknown optional fields out rather than guessing.
5. Verify, then commit the JSON and the GPX together:
   ```bash
   node scripts/validate.mjs
   ```
   ```bash
   node --test tests/
   ```

Without a GPX: append the entry to `races.json` by hand, with `location.lat/lon` if known.

## Working on the code

- Serve locally with `python3 -m http.server 8000` (`file://` cannot `fetch()`).
- `js/gpx.js`, `js/format.js` and `js/data.js` are pure and unit-tested; put logic there and add a test. They run in Node too (`gpx.js` uses `DOMParser` in the browser and a regex reader in Node).
- Build HTML with the `html` tagged template in `js/ui.js`; it escapes every interpolation. Use `raw()` only for trusted markup.
- View state that should be shareable goes in the hash query through `ctx.setQuery()`.
- After UI changes, check every route in both colour schemes and at phone width, with no console errors.
- Before committing: `node --check` on changed modules, `node scripts/validate.mjs`, `node --test tests/`.
- Privacy: everything in `data/` is public. Only add a person's data when the user confirms that person agreed.
