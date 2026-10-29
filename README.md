# London Bike Pulse

A cycle-hire visualization project using Leaflet, OpenStreetMap and MySQL. The active V3 application combines a map, station insights and full-day historical playback using real collected observations.

## Start with V3

**[V3 setup, database import and usage guide](v3/README.md)**

Requirements: Node.js 22.13+, MySQL 8+, and internet access for map tiles.

1. Create an empty MySQL database and configure `v3/.env` using `v3/.env.example`.
2. From `v3/`, run:

   ```bash
   npm ci
   npm run db:import
   npm start
   ```

3. Open http://127.0.0.1:3030/ . Select 28 October 2026 for a day with substantial recorded history, or use the demonstration links in the V3 guide.

The included SQL snapshot contains real station metadata, availability history, collisions and display configuration. Teammates can reproduce the saved dataset in their own MySQL instance without the original local CSV files or database credentials. Later live collections are separate until a new snapshot is shared or a shared database is configured.

## Repository layout

| Directory | Purpose |
| --- | --- |
| [`v3/`](v3/README.md) | Active MySQL application, collection tools, tests and setup guide |
| [`v3/sql/`](v3/sql/) | Portable schema, real data snapshot and checksum manifest |
| [`v1/`](v1/README.md) | Retained earlier website and configuration |
| [`v2/`](v2/README.md) | Retained original collection tools and prototype API |
| `docs/` | Shared project documentation and presentations |
| `design/` | Shared wireframes and storyboards |

V1 and V2 remain available for comparison and project history. Their original source and shared team materials are preserved independently of V3.

## Data and display behaviour

V3 reads its application data from MySQL. The map shows 400 selected original stations, groups nearby markers and limits visible collision samples to reduce clutter. Insights uses the complete loaded regional collision records.

Database timestamps are UTC; playback uses London local time. Missing or stale observations stay grey and appear as chart gaps. No observations are fabricated to fill the day. The optional collector appends real observations every five minutes while the computer, network and database remain available.

## Configuration and validation

Database credentials belong in the ignored local `.env` file. SQL snapshots contain data, not account credentials. Starting the application does not automatically install the optional background collector.

Run `npm test` from `v3/` for fixture-based unit and HTTP checks. `npm run test:import` verifies restoration into an isolated temporary MySQL database and requires database creation/deletion privileges. See the [V3 guide](v3/README.md) for collection, snapshot updates and troubleshooting.
