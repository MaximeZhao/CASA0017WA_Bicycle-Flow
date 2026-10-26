"use strict";
const fs = require("node:fs/promises");
const config = require("./config");
const { validate } = require("../assets/js/data-contract");
function dayOf(timestamp) {
  return timestamp.slice(0, 10);
}
function validDate(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
function selectDate(data, requested) {
  validate(data);
  const availableDates = [
    ...new Set(
      data.stations.flatMap((s) => s.history.map((h) => dayOf(h.recordedAt))),
    ),
  ]
    .sort()
    .reverse();
  const date = requested || availableDates[0] || null;
  return {
    ...data,
    meta: { ...data.meta, availableDates, date },
    stations: data.stations.map((s) => ({
      ...s,
      history: s.history.filter((h) => dayOf(h.recordedAt) === date),
    })),
  };
}
async function loadDashboard(date) {
  if (date && !validDate(date)) {
    const e = new Error("date must be a valid YYYY-MM-DD in UTC");
    e.status = 400;
    throw e;
  }
  const data =
    config.mode === "mysql"
      ? await require("./database").readDataset(date)
      : selectDate(
          JSON.parse(await fs.readFile(config.dataFile, "utf8")),
          date,
        );
  validate(data);
  const timestamps = [
    ...new Set(
      data.stations.flatMap((s) => s.history.map((h) => h.recordedAt)),
    ),
  ].sort();
  return {
    ...data,
    meta: {
      ...data.meta,
      mode: config.mode,
      timestamps,
      generatedAt: new Date().toISOString(),
      staleAfterSeconds: config.staleAfterSeconds,
    },
  };
}
module.exports = { loadDashboard, selectDate, validDate };
