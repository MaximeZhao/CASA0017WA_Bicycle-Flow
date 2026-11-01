# Mind The Dock V4

V4 contains the responsive Mind The Dock website, area/station search, complete Daily Flow station analysis, Contact Us, warning-triangle collision markers and the collision-layer switch. V1, V2 and V3 are retained independently.

## Start on Windows without MySQL

Open a **new CMD window** so environment variables from V3 are not inherited, then run:

```cmd
cd /d E:\casa0017\groupproject\COONEVM0017\v4
npm ci
npm run dev
```

Open http://127.0.0.1:3040/?date=2026-10-28&time=2026-10-28T08%3A00%3A00Z

`npm start` runs the same app without watching backend changes. V4 defaults to JSON mode and port **3040**, separate from V3's port 3030. No `.env`, database password or MySQL Server is needed for the bundled playback. Refresh the browser after frontend edits.

If reusing a CMD window that previously set V3 variables, clear its overrides before starting:

```cmd
set "DATA_SOURCE="
set "DATA_FILE="
set "PORT="
```

Map tiles need internet access. The recorded observations are included in this folder and do not require a connection to another teammate's computer.

## Pages and behaviour

- `/` — Live Map with area/station search, borrow/return modes, playback, clustering, collision warning triangles and a layer switch.
- `/insights.html` — Daily Flow: the complete original Station Insights interface, including station selection/search, availability curves, summary statistics, nearby collisions, network bars, filters, sorting and playback.
- `/home.html` — Home.
- `/contact.html` — Project introduction and five team members. Email addresses, sources and copyright are plain text; only the site navigation changes pages.
- `/daily-flow.html` remains an alias for the analysis page.

Navigation retains station, date, time and borrow/return mode. Red stations do not flash. The wrench appears in the map key only; no maintenance observations are invented.

## Included data

`data/history.json` contains **400 selected stations, 113,458 original observations and 2,288 regional collisions**. It is a portable conversion of the bundled SQL snapshot, with missing periods retained. It is the default runtime dataset.

On 28 October 2026, 398 stations have 92,734 observations at 233 distinct capture times. The other two selected stations remain unknown. Available dates are 12, 27, 28 and 29 October 2026. The 2025 collision records cover a different period. This saved dataset is not a continuously updating live feed.

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
