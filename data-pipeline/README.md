# Teammate data pipeline

This folder groups the collection and database tools uploaded by **YifeiG979**. The original upload and pull-request history remain in Git. Moving these files does not transfer their authorship to the person organizing the repository.

Original source: `7847bd3` (upload), `d93281d` (ignore rules), `223a407` (testing server), merged upstream in `6327c9f`.
Original explanations: [Data Explanation.docx](../docs/data-pipeline/Data%20Explanation.docx) and [Code Explain.txt](../docs/data-pipeline/Code%20Explain.txt). The source documents are preserved unchanged; their old root paths refer to the layout before organization.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `db.js` | Shared MySQL pool; loads this folder's `.env` |
| `test_db.js` | Check database connectivity and list tables |
| `collect_bikes.js` | Fetch TfL stations, update latest state and append `availability_history` |
| `inspect_collision_data.js` | Inspect the three original DfT CSV files |
| `collect_collisions.js` | Join collision/vehicle/casualty data and import London cyclist-related collisions |
| `export_csv.js` | Export four database tables to `data/exports/` |
| `prototype-server.js` | Teammate's testing API, preserved separately from the main website |
| `data/raw/` | Local DfT inputs; large CSVs are not committed |
| `data/exports/` | Generated local CSV exports; not committed |

## Setup

From this folder:

```bash
npm ci
cp -n .env.example .env
```

Fill in your own database credentials in `data-pipeline/.env`. Existing local credentials were retained locally, but `.env` is no longer tracked in the current repository tree. Never upload it.

Run only the command you intend to use:

```bash
npm run check
npm run test:db
npm run collect:bikes
npm run inspect:collisions
npm run collect:collisions
npm run export:csv
npm run start:prototype
```

`collect:bikes`, `collect:collisions` and the fault-report POST endpoint write to the configured database. They were **not** executed during directory organization.
The prototype defaults to port **3001**, separate from the main website. Set `PIPELINE_PORT` here to change it.

Required input filenames under `data/raw/`:

- `dft-road-casualty-statistics-collision-2025.csv`
- `dft-road-casualty-statistics-vehicle-2025.csv`
- `dft-road-casualty-statistics-casualty-2025.csv`

The Word explanation mentions `public/index.html` and `public/app.js`, but those files were not present in the fetched upload. No replacement prototype frontend has been invented here.

## Database boundary

This pipeline expects its existing `london_bike_pulse` database, with `bike_stations`, `availability_history`, `collisions` and `fault_reports`. The upload contains SQL inside JavaScript, but no complete CREATE TABLE migration for that latest model.

The main dashboard's `sql/schema.sql` defines **another model** (`stations`, `station_snapshots`, and a different `collisions` structure). Do not initialize that schema over the teammate's database and assume compatibility. Keep credentials and database names separate until a reviewed data adapter/migration is implemented.

CSV exports are also not directly interchangeable with the dashboard JSON contract. A mapping/adapter is a next integration step, not part of this file-organization change.
