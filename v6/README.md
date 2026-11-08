# Mind The Dock V5

## Interface update

See [修改说明.md](修改说明.md) for the exact uploaded artwork, shared “Hi, username” menu, persistent Profile, desktop Contact layout, linked Daily Flow charts and validation. Start at **http://127.0.0.1:3050/home.html** after running the server. Preserve your own `.local/` folder when updating an existing installation.

V5 retains V4's Node.js website and imports reusable TfL availability CSV files. Copy the entire v5 folder to another computer. V1–V4 are independent.

## Run

Install Node.js 22.13 or later. Open a new terminal inside v5:

```cmd
npm ci
npm start
```

Open http://127.0.0.1:3050/?date=2026-11-07 . Keep the terminal open. This Node application needs its own server; double-clicking HTML and Live Server cannot provide its API. MySQL is not required.

V5 defaults to JSON data/history.json and port 3050. Old DATA_SOURCE, DATA_FILE, HOST and PORT environment variables override defaults; clear them in a reused CMD terminal. npm run dev enables backend watching.

## Current CSV dataset

V4 and V5 bundle three consecutive 24-hour datasets, with 797 station IDs and 57,254 observations. The original November timestamps remain unchanged. The two new files use their adjusted `simulated_at` for playback, stored as ISO UTC `recordedAt`; `actual_captured_at` is preserved as `actualCapturedAt`. London is UTC on these dates.

| Dataset | Playback interval | Observations |
| --- | --- | ---: |
| Existing TfL_Bike_Availability_24H.csv | 4 Nov 2026 14:05:41 – 5 Nov 13:05:42 | 19,094 |
| TfL_Bike_24H_SIMULATED(3).csv, adjusted | 5 Nov 2026 14:00 – 6 Nov 13:00 | 19,080 |
| TfL_Bike_24H_SIMULATED(2).csv, adjusted | 6 Nov 2026 14:00 – 7 Nov 13:00 | 19,080 |

The new simulated blocks follow the original data in sequence. Each new file maps `collection_hour` 1–24 to its block start plus 0–23 hours. Its original January simulation dates are preserved in `original_simulated_at` in the adjusted CSV; original files and actual capture times are unchanged. These are 72 capture positions across three 24-hour blocks, crossing four calendar dates. The date selector therefore offers 4–7 November (10, 24, 24 and 14 capture positions). The newest date is selected by default.

The two new files have 795 stations each; missing station samples stay unknown. Charts connect adjacent hourly samples, breaking on gaps over the hourly cadence plus two minutes. Status retains the 15-minute freshness limit. The interface identifies the dataset as including simulated availability.

All sources are included in `data/imports/`. Run `npm run data:three-days` to rebuild this dataset locally; the prior JSON is backed up under `data/backups/`. The date mapping and source hashes are recorded in `data/import-report.json`.

The 2,288 historical collision records are retained from V4 and cover its original regional rectangle only, not all newly displayed station areas. Zero nearby records outside that coverage is not evidence that no collisions occurred. Contact Us and all original station analysis functions remain available.

## Import similar files later

From inside v5:

```cmd
npm run data:import -- "D:\\your-folder\\next-file.csv" --timezone UTC
```

For timestamps exported in London local time, use --timezone Europe/London. The importer rejects ambiguous or nonexistent daylight-saving times; export UTC for those dates. Timestamps support `yyyy-MM-dd HH:mm:ss` and `yyyy/M/d H:mm[:ss]`. If `simulated_at` exists it always supplies playback time; empty or invalid values fail without falling back to capture time. Legacy files without it use `captured_at`. Required columns are:

collection_hour, station_id, station_name, latitude, longitude, simulated_at (or captured_at), bikes, standard_bikes, electric_bikes, empty_docks, total_docks, unavailable_docks, is_locked

Quoted CSV names, UTF-8 BOM and leading apostrophes in numeric coordinates are supported. The import checks coordinates, nonnegative integer counts, bike-type sums, dock totals, locking flags, unique station/time pairs and consistent station metadata. A zero is retained as zero. unavailable_docks is stored separately from faults; no reported faults are inferred. Standard/electric counts are preserved in JSON; the existing UI displays total bikes.

Default import appends observations and adds new stations, preserving previous dates and collisions. Identical existing observations are skipped. Conflicting values fail before changing history.json; resolve the source conflict explicitly. --replace intentionally replaces availability history with that CSV while retaining collisions.

The importer stores source CSV copies in data/imports/, writes data/import-report.json, and backs up the previous history.json in ignored data/backups/. Keep import source files and generated history.json when sharing. Refresh the browser after import.

## Checks and legacy tools

npm test runs import validation and original application tests. data/showcase.json remains a small test fixture and is not the runtime dataset.

The copied sql/ snapshot and MySQL/collector tools are legacy development options from V4, not the updated CSV dataset. Importing that SQL will show October data. CSV import currently targets JSON mode only. If live collection is needed later, configure a separate mind_the_dock_v5 database; CSV import does not run collection.

OpenStreetMap tiles require internet. Availability data is bundled locally. This is recorded historical playback, not a continuously updating feed.

## Live Map controls

Select **Map tools** on the left to open the tool directory. Its three sections reveal Search board, Colours & map key, and Historic collisions. Find a Bike / Return a Bike is always visible at the top right of the map, directly below the navigation bar. Each panel opens on demand; changing panels preserves the selected mode and collision visibility.

Select the small grey handle at the bottom to expand the compact playback dock. Select it again or use the close button to collapse it. The dock reserves its own layout space: the map stays sharp, visible and interactive, with no backdrop or focus lock. The purple 404 team logo follows the selected observation as playback progresses. Drag the timeline or use the arrow keys, Home and End. Escape collapses playback while focus is inside the dock. Collapsing pauses playback. Motion effects respect the device's reduced-motion preference.
