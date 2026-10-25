"use strict";
// Run explicitly against a disposable database; never included in npm test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const db = require("../lib/database");
const { validate } = require("../assets/js/data-contract");
const { loadDashboard } = require("../lib/data-source");
(async () => {
  try {
    assert.equal(process.env.DATA_SOURCE, "mysql", "Set DATA_SOURCE=mysql");
    assert.match(
      process.env.DB_NAME || "",
      /_test$/,
      "Use a disposable database ending in _test",
    );
    let data = await loadDashboard();
    assert.equal(data.stations.length, 0);
    const fixture = validate(
      JSON.parse(fs.readFileSync("data/example-station.json", "utf8")),
    );
    await db.importDataset(fixture);
    await db.importDataset(fixture);
    const [[count]] = await db
      .getPool()
      .query("SELECT COUNT(*) AS n FROM station_snapshots");
    assert.equal(count.n, 13);
    data = await loadDashboard();
    assert.equal(data.meta.timestamps.length, 13);
    assert.equal(
      data.stations[0].history[0].recordedAt,
      "2026-10-19T08:00:00Z",
    );
    const changed = structuredClone(fixture);
    changed.stations[0].history[0].bikes = 0;
    await db.importDataset(changed);
    data = await loadDashboard();
    assert.equal(
      data.stations[0].history[0].bikes,
      fixture.stations[0].history[0].bikes,
      "existing snapshot must be immutable",
    );
    const more = structuredClone(fixture);
    more.stations[0].history = [
      { ...more.stations[0].history[0], recordedAt: "2026-10-20T08:00:00Z" },
    ];
    await db.importDataset(more);
    data = await loadDashboard();
    assert.equal(data.meta.date, "2026-10-20");
    assert.equal(data.meta.timestamps.length, 1);
    assert.deepEqual(data.meta.availableDates, ["2026-10-20", "2026-10-19"]);
    data = await loadDashboard("2026-10-19");
    assert.equal(data.meta.timestamps.length, 13);
    // Bypass the importer CLI validator to prove database constraints and rollback.
    const bad = structuredClone(more);
    bad.stations[0].name = "Must roll back";
    bad.stations[0].history[0].recordedAt = "2026-10-20T08:05:00Z";
    bad.stations[0].history[0].bikes = 999;
    await assert.rejects(db.importDataset(bad));
    data = await loadDashboard();
    assert.equal(data.stations[0].name, fixture.stations[0].name);
    assert.equal(data.meta.timestamps.length, 1);
    await db
      .getPool()
      .query(
        "CREATE TABLE bike_stations (station_id VARCHAR(50) PRIMARY KEY, station_name VARCHAR(255), latitude DOUBLE, longitude DOUBLE, available_bikes INT, recorded_at DATETIME)",
      );
    await db
      .getPool()
      .execute("INSERT INTO bike_stations VALUES (?,?,?,?,?,?)", [
        "LEGACY-01",
        "Old station",
        51.5,
        -0.1,
        8,
        "2026-10-18 08:00:00",
      ]);
    const migration = fs
      .readFileSync("sql/migrate-legacy.sql", "utf8")
      .replace(/^--.*$/gm, "");
    const connection = await db.getPool().getConnection();
    try {
      for (let repeat = 0; repeat < 2; repeat++)
        for (const statement of migration
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean))
          await connection.query(statement);
    } finally {
      connection.release();
    }
    data = await loadDashboard("2026-10-18");
    const legacy = data.stations.find((s) => s.id === "LEGACY-01");
    assert.equal(legacy.history.length, 1);
    assert.equal(legacy.history[0].isOperational, null);
    assert.equal(legacy.history[0].docks, null);
    const [[oldCount]] = await db
      .getPool()
      .query("SELECT COUNT(*) AS n FROM bike_stations");
    assert.equal(oldCount.n, 1);
    console.log(
      "PASS: empty database, schema, repeated import, immutable history, date queries, CHECK constraints, transaction rollback, non-destructive repeatable legacy migration",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
