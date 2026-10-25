"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { validate, snapshotAt, status } = require("../assets/js/data-contract");
const { selectDate, validDate } = require("../lib/data-source");
const { createServer, staticPath } = require("../server");
const fixture = () =>
  JSON.parse(fs.readFileSync("data/demo-data.json", "utf8"));
test("example, demo and empty template follow one contract", () => {
  for (const file of [
    "demo-data.json",
    "template.json",
    "example-station.json",
  ])
    validate(JSON.parse(fs.readFileSync("data/" + file, "utf8")));
});
test("history selection never invents observations or uses a future observation", () => {
  const history = fixture().stations[0].history;
  assert.equal(snapshotAt(history, "2026-10-15T07:59:59Z"), null);
  assert.equal(snapshotAt(history, "2026-10-15T08:04:00Z"), history[0]);
  assert.equal(snapshotAt(history, "2026-10-15T18:01:00Z"), history.at(-1));
});
test("missing, stale and unknown operational states cannot appear available", () => {
  const item = { ...fixture().stations[0].history[0] };
  assert.equal(status(item, "borrow", "2026-10-15T08:15:01Z", 900), "unknown");
  item.isOperational = null;
  assert.equal(status(item, "borrow", item.recordedAt, 900), "unknown");
  item.isOperational = false;
  assert.equal(status(item, "borrow", item.recordedAt, 900), "closed");
  item.isOperational = true;
  item.docks = null;
  assert.equal(status(item, "return", item.recordedAt, 900), "unknown");
});
test("reject duplicate IDs, impossible counts and unsorted history", () => {
  let d = fixture();
  d.stations.push(d.stations[0]);
  assert.throws(() => validate(d), /Duplicate/);
  d = fixture();
  d.stations[0].history[0].bikes = d.stations[0].history[0].capacity + 1;
  assert.throws(() => validate(d), /capacity/);
  d = fixture();
  d.stations[0].history.reverse();
  assert.throws(() => validate(d), /sorted/);
  d = fixture();
  d.stations[0].history[0].recordedAt = "2026-02-30T08:00:00Z";
  assert.throws(() => validate(d), /timestamp/);
});
test("date selection is UTC-specific and does not leak other days", () => {
  const d = fixture();
  d.stations[0].history.push({
    ...d.stations[0].history[0],
    recordedAt: "2026-10-20T00:00:00Z",
  });
  const selected = selectDate(d, "2026-10-20");
  assert.equal(selected.stations[0].history.length, 1);
  assert.equal(selected.stations[1].history.length, 0);
  assert.deepEqual(selected.meta.availableDates, ["2026-10-20", "2026-10-15"]);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-10-20"), true);
});
test("empty template stays empty without synthetic data", () => {
  const empty = JSON.parse(fs.readFileSync("data/template.json", "utf8"));
  const data = selectDate(empty);
  assert.deepEqual(data.stations, []);
  assert.deepEqual(data.meta.availableDates, []);
  assert.equal(data.meta.date, null);
});
test("static allowlist cannot expose credentials, source, git or backup HTML", () => {
  for (const url of [
    "/.env",
    "/.git/config",
    "/fetch_bikes.py",
    "/server.js",
    "/package.json",
    "/index.single-file.backup.html",
    "/assets/js/../../.env",
  ])
    assert.equal(staticPath(url), null);
  assert.ok(staticPath("/assets/js/app.js"));
});
test("HTTP API, validation errors, pages and private file protection", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const result = await fetch(base + "/api/dashboard");
    assert.equal(result.status, 200);
    const data = await result.json();
    validate(data);
    assert.equal(data.meta.mode, "demo");
    assert.equal(data.meta.timestamps.length, 11);
    assert.equal(
      (await fetch(base + "/api/dashboard?date=2026-02-30")).status,
      400,
    );
    const empty = await (
      await fetch(base + "/api/dashboard?date=2020-01-01")
    ).json();
    assert.equal(empty.meta.timestamps.length, 0);
    for (const url of [
      "/",
      "/insights.html",
      "/vendor/leaflet.js",
      "/vendor/leaflet.css",
    ])
      assert.equal((await fetch(base + url)).status, 200, url);
    for (const url of [
      "/.env",
      "/fetch_bikes.py",
      "/index.single-file.backup.html",
    ])
      assert.equal((await fetch(base + url)).status, 404, url);
    assert.equal(
      (await fetch(base + "/api/dashboard", { method: "POST" })).status,
      405,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
