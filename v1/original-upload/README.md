# London Bike Pulse

This version separates the original single-file prototype into presentation, data and application layers.

## Project structure

```text
Axure_Test/
├── index.html                  Page structure
├── index.single-file.backup.html  Original file backup
├── server.js                   Static website and local API server
├── package.json                Start command
├── assets/
│   ├── css/styles.css          All visual styling
│   └── js/
│       ├── config.js           Select demo data or the live API
│       ├── data-service.js     Fetch and validate JSON
│       └── app.js              Map, tooltip, mode and timeline behaviour
├── data/demo-data.json         Replaceable sample dataset
└── docs/API_DATA_FORMAT.md     JSON contract for a backend API
```

## Run it

The recommended method runs both the page and `/api/dashboard`:

1. Open the `Axure_Test` folder in VS Code.
2. Open **Run and Debug**.
3. Select **Run London Bike Pulse**.
4. Press the green Run button.
5. Open `http://localhost:3000`.

You can also run `npm start` in the VS Code terminal. No `npm install` is required.

If you use Live Server instead, the page automatically falls back to `data/demo-data.json` when the API is unavailable.

## Use real data

The starter server returns `data/demo-data.json` through `/api/dashboard`, so the complete flow can be tested immediately. When the real backend is ready, change `liveDataUrl` in `assets/js/config.js` or replace `readDashboardData()` in `server.js` with your database query.

The expected response format is documented in `docs/API_DATA_FORMAT.md`.

The frontend must call an HTTP API. Do not place a MySQL username or password in browser JavaScript.
