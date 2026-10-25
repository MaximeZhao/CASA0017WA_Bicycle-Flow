"use strict";
const fs = require("node:fs");
const { validate } = require("../assets/js/data-contract");
try {
  const data = validate(
    JSON.parse(
      fs.readFileSync(process.argv[2] || "data/demo-data.json", "utf8"),
    ),
  );
  console.log(
    `Valid: ${data.stations.length} stations, ${data.stations.reduce((n, s) => n + s.history.length, 0)} snapshots, ${data.collisions.length} collisions`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
