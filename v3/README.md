# London Bike Pulse — V3

A MySQL-backed cycle-hire dashboard with a Leaflet/OpenStreetMap map, historical playback and station insights. The included SQL snapshot lets another developer reproduce the project with their own local database.

Station selection, availability history and collision records are read from MySQL during normal operation. CSV and JSON files are retained as migration inputs and test fixtures, rather than runtime data sources.

## Requirements

- Node.js 22.13 or later, with npm.
- MySQL 8 or later, running locally or on an accessible server.
- An internet connection for OpenStreetMap tiles. Live collection also requires access to the public TfL BikePoint API.
- Python 3 only for optional legacy CSV migration and the macOS collector-management script. It is not required to import the supplied SQL snapshot or start the dashboard.

## Quick start

### 1. Install dependencies

From the repository root:

```bash
cd v3
npm ci
```

### 2. Create an empty database

Run this in MySQL Workbench or another MySQL client:

```sql
CREATE DATABASE bike_project_demo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 3. Configure the connection

Copy `.env.example` to `.env` and replace the credentials with your own:

```dotenv
DATA_SOURCE=mysql
DATA_FILE=data/showcase.json
PORT=3030
STALE_AFTER_SECONDS=900
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=bike_project_demo
```

`DATA_FILE` is used by migration tools and explicit JSON test modes; the MySQL dashboard does not read it. Keep `.env` local. It is excluded from Git, and the SQL snapshot contains no database credentials.

### 4. Import the snapshot

```bash
npm run db:import
```

This command checks the snapshot's SHA-256 checksum, creates the tables and imports their data. It then verifies every table's row count against `sql/snapshot.json`.

**Use an empty database.** The importer refuses a non-empty database instead of overwriting existing records. If you already have project data, choose a different database name.

Alternatively, select your empty database in MySQL Workbench and execute `sql/schema.sql`, followed by `sql/demo-data.sql`. The Node importer provides additional validation and is the recommended route.

### 5. Start the application

```bash
npm start
```

Open [the dashboard](http://127.0.0.1:3030/). For a representative day with substantial recorded history, use:

- [Map playback — 28 October 2026, 08:00 London time](http://127.0.0.1:3030/?station=BikePoints_374&date=2026-10-28&time=2026-10-28T08%3A00%3A00Z&mode=borrow)
- [Station insights — the same station and time](http://127.0.0.1:3030/insights.html?station=BikePoints_374&date=2026-10-28&time=2026-10-28T08%3A00%3A00Z&mode=borrow)

The latest date in the snapshot may contain only part of a day. Use the date selector to explore other dates. Each machine needs its own running application and database; `127.0.0.1` refers to the computer opening the link.

## Included data

The approximately 15 MB snapshot contains real observations, with missing periods preserved.

| Table | Snapshot rows | Purpose |
| --- | ---: | --- |
| `bike_stations` | 801 | Station metadata and latest collected state |
| `availability_history` | 227,457 | Recorded availability, unique by station and capture time |
| `collisions` | 5,990 | Original historical collision records |
| `fault_reports` | 0 | Fault-report storage; no reports are included in this snapshot |
| `dashboard_stations` | 400 | Selected display stations, priority flags, selection reasons and display order |
| `dashboard_settings` | 1 | Presentation settings, including geographic bounds |

`sql/snapshot.json` is the source of truth for snapshot creation time, row counts, checksum and the recommended view. The included dates are 12, 27, 28 and 29 October 2026. Availability observations and 2025 collision records cover different periods.

A repository pull does not copy a running MySQL database. Importing the snapshot reproduces its saved state. Later collections on one computer are not automatically shared with others: export and share an updated snapshot, or use a separately configured shared database.

## What the visualizations mean

- **Station selection:** 400 original stations, including 40 priority stations near transport hubs and landmarks. Additional stations retain the natural geographic distribution. Priority is a presentation choice, not a measured passenger-volume ranking.
- **Blue numbered groups:** the number of nearby stations grouped together, not the number of bikes. Click a group or zoom in to reveal its stations.
- **Availability colours:** green means 6 or more bikes/docks, amber means 1–5, and red means zero. Borrow and Return modes use their respective counts.
- **Grey markers:** no fresh observation is available at the selected time. An observation expires after 15 minutes by default; unknown values are displayed as `—`.
- **Collision layer:** the map displays up to 100 spatially distributed original records to reduce clutter. The API and Insights retain all collision records within the selected display region; nearby counts use the loaded regional records, not just the map sample. These are historical context, not a live risk score.
- **Faults:** unavailable docks are not converted into invented fault-report counts. Unavailable fault metrics remain `—`.

## Full-day playback

Database timestamps are UTC. The interface displays `Europe/London` time and handles daylight-saving transitions, including 23-hour and 25-hour days.

The timeline covers the selected local date from 00:00 to 23:59. It includes five-minute selection points and exact original capture times. Timeline positions do not create observations: the interface uses the nearest earlier record only while it remains fresh. Missing periods appear as grey markers and gaps in the charts.

Map and Insights navigation preserve the station, date, time and mode. **Latest data** selects the newest available date and observation and follows subsequent updates. Moving the timeline manually keeps the selected historical view. Pages check for updates every minute; the collector runs every five minutes.

## Database commands

Run these from `v3/`:

| Command | Behaviour |
| --- | --- |
| `npm run db:import` | Import the bundled snapshot into an empty database, including schema creation and validation |
| `npm run db:init` | Create missing project tables without importing observations |
| `npm run db:verify` | Print current row counts |
| `npm run db:export` | Export a consistent snapshot of the configured database to `sql/demo-data.sql` and update `sql/snapshot.json` |
| `npm run collect:once` | Collect and save one batch of current TfL observations |
| `npm test` | Run fixture-based unit and HTTP tests without accessing the live database |
| `npm run test:import` | Restore the snapshot into a temporary database and verify data equivalence, HTTP responses and non-empty-database protection |

`test:import` requires permission to create and drop databases. It removes only the uniquely named temporary database it creates; the source database is retained. It also verifies that MySQL reads work with a deliberately nonexistent local JSON data path.

The exporter reads a consistent database snapshot while collection can continue. Share `schema.sql`, `demo-data.sql` and `snapshot.json` together after refreshing the export.

## Optional continuous collection

Starting the website does **not** enable scheduled collection on a teammate's computer. The imported snapshot is enough to demonstrate the saved project.

For a single additional batch:

```bash
npm run collect:once
```

On macOS, the optional background task can be managed with:

```bash
python3 scripts/manage-collector.py start
python3 scripts/manage-collector.py status
python3 scripts/manage-collector.py stop
```

The user-level task runs on login and every 300 seconds while enabled. It collects all valid TfL stations, not only the selected display stations. Each batch updates the latest station state and appends history in one transaction. Invalid or missing required fields are skipped, repeated runs within the same five-minute bucket are avoided, and failed transactions are rolled back before a later retry.

Keep the computer awake and connected, with MySQL running. Display sleep alone does not stop collection; system sleep, shutdown or logout interrupts it. Closing the webpage does not stop an enabled background task. Missing historical periods are not backfilled with fabricated values.

Logs are stored under `logs/`. `/api/collection-status` reports the last result. Credentials, runtime status and logs are excluded from Git.

## Legacy migration tools

These are for maintainers migrating original uploads, not for teammates importing the supplied snapshot:

- `npm run data:prepare` reads the legacy CSV exports and rebuilds the selection/test JSON.
- `npm run db:seed` migrates selection metadata and original collisions into MySQL. It requires Python 3, `data/showcase.json` and the original `../v2/data/exports/collisions.csv`. Existing collision records are not overwritten.

Changing migration files alone does not change the active MySQL dashboard. Apply the migration deliberately, then export a new snapshot if the updated dataset needs to be shared.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Access denied` or connection failure | Confirm MySQL is running and that the host, port, username, password and database name in `.env` match your own connection |
| `Unknown database` | Create the empty database named in `.env` before importing |
| Import refuses a non-empty database | Use a new empty database; do not delete existing team data to bypass the check |
| Snapshot checksum mismatch | Obtain matching `demo-data.sql` and `snapshot.json` files from the same version |
| Grey markers or `—` values | Select a date/time with recorded observations; gaps and stale data are intentionally not filled |
| Map background is missing | Check internet access to OpenStreetMap; station records are served from MySQL independently |
| Port 3030 is occupied | Stop the other preview or set another `PORT` in `.env`, then restart |

The same-origin endpoints are `/api/dashboard`, `/api/health` and `/api/collection-status`. The server binds to `127.0.0.1` by default. V1, V2 and shared team documents are preserved separately.
