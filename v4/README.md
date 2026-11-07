# Mind The Dock V4

V4 contains the responsive Mind The Dock website, area/station search, complete Daily Flow station analysis, Contact Us, warning-triangle collision markers and the collision-layer switch. V1, V2 and V3 are retained independently.

## Start on another computer without MySQL

Install **Node.js 22.13 or later** with npm included. Download or clone the repository, then open the `v4` folder. It can be stored on any drive or in any directory.

Open a terminal **inside the `v4` folder** (Windows, macOS or Linux), then run:

```cmd
npm ci
npm start
```

Open http://127.0.0.1:3040/?date=2026-11-06&time=2026-11-06T08%3A00%3A00Z

Open the URL in a browser on the **same computer running the server**. `127.0.0.1` refers to that computer; it does not connect to the author's computer.

**Do not double-click `index.html` or use VS Code Live Server for this version.** V4 uses its Node server for `/api/dashboard` and `/vendor/leaflet.*`. A static file server cannot provide these routes, so the page can appear blank, unstyled or without data. GitHub Pages also cannot run this Node backend.

`npm run dev` runs the same app and watches backend changes. V4 defaults to JSON mode and port **3040**, separate from V3's port 3030. No `.env`, database password or MySQL Server is needed for the bundled playback. Refresh the browser after frontend edits.

If reusing a CMD window that previously set V3 variables, clear its overrides before starting:

```cmd
set "DATA_SOURCE="
set "DATA_FILE="
set "PORT="
set "HOST="
```

Map tiles need internet access. The recorded observations are included in this folder and do not require a connection to another teammate's computer.

If startup fails, keep the terminal message for troubleshooting. If port 3040 is already in use, stop the other app using it before retrying. Once started, `http://127.0.0.1:3040/api/health` should return `{"status":"ok","mode":"json"}`.

## Pages and behaviour

- `/` — Live Map with area/station search, borrow/return modes, playback, clustering, collision warning triangles and a layer switch.
- `/insights.html` — Daily Flow: the complete original Station Insights interface, including station selection/search, availability curves, summary statistics, nearby collisions, network bars, filters, sorting and playback.
- `/home.html` — Home.
- `/contact.html` — Project introduction and five team members. Email addresses, sources and copyright are plain text; only the site navigation changes pages.
- `/daily-flow.html` remains an alias for the analysis page.

Navigation retains station, date, time and borrow/return mode. Red stations do not flash. The wrench appears in the map key only; no maintenance observations are invented.

## Included data

`data/history.json` now contains **797 station IDs, 57,254 observations and 2,288 regional collisions**, matching V5. The original 24-hour CSV retains its timestamps from **4 November 2026 14:05:41 to 5 November 13:05:42** (19,094 rows). The new files use adjusted `simulated_at` values: file (3) covers **5 November 14:00 to 6 November 13:00**, and file (2) covers **6 November 14:00 to 7 November 13:00**, each with 19,080 rows. Their actual capture times and original source CSVs are retained.

These are three consecutive 24-hour blocks with 72 capture positions. Calendar-date selection offers 4–7 November, with 10, 24, 24 and 14 positions respectively. The interface identifies simulated data; missing station samples stay unknown.

Original source CSVs and the two date-adjusted CSVs are bundled in `data/imports/`. `npm run data:three-days` rebuilds this dataset and backs up the previous JSON. `npm run data:import -- "file.csv" --timezone UTC` imports another CSV, preferring `simulated_at` and retaining `actual_captured_at` as `actualCapturedAt`. See the [V5 data guide](../v5/README.md) for the date mapping and import format. Each version has its own importer and data, and runs independently.

The 2025 collision records retain their original regional coverage, which does not cover every CSV station area. The copied SQL snapshot is still the older October dataset; selecting MySQL mode does not use the new JSON playback.

`data/showcase.json` is the smaller older fixture used by automatic tests, not the default runtime dataset. The original SQL snapshot is also retained in `sql/` for optional MySQL use. See [data coverage](docs/DATA_COVERAGE.md) and [PBI checks](docs/LIVE_MAP_PBIS.md).

## Checks

```cmd
npm test
```

Tests use explicit local fixtures and simulated collection transactions. They do not write to a real database. Browser checks cover navigation, station details, analysis controls, collision switching and responsive desktop/mobile layouts.

## Optional MySQL mode

Create your own **empty V4 database** (for example `mind_the_dock_v4`) and copy `.env.example` to `.env`. Set `DATA_SOURCE=mysql` and fill in your own credentials. Then run:

```cmd
npm run db:import
npm run db:verify
npm start
```

Use a separate database from V3. The importer checks the bundled SQL checksum and refuses non-empty project tables. SQL files use LF line endings to keep their checksum stable on Windows.

Live collection (`npm run collect:once`) requires MySQL and access to TfL. Opening the website does not start scheduled collection. Legacy CSV migration commands are optional maintenance tools that read the original V2 exports; they are not needed to run V4.

## Sharing V4

Commit the **entire `v4/` folder**, including its lockfile and `data/history.json`. Dependencies (`node_modules`), `.env`, logs and collection status are ignored. Screenshots and the former external temporary JSON are not needed to run this version. No previous version needs to be edited or deleted.

## Live Map controls

Select **Map tools** on the left to open the tool directory. Its four sections reveal Search board, Colours & map key, Find / return a bike, and Historic collisions. Each panel opens on demand; changing panels preserves the selected mode and collision visibility.

Select the small grey handle at the bottom to expand the compact playback dock. Select it again or use the close button to collapse it. The dock reserves its own layout space: the map stays sharp, visible and interactive, with no backdrop or focus lock. The group bicycle logo follows the selected observation and animates during playback. Drag the timeline or use the arrow keys, Home and End. Escape collapses playback while focus is inside the dock. Collapsing pauses playback. Motion effects respect the device's reduced-motion preference.
