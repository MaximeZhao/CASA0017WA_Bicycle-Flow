/* Shared by the browser, server and import CLI. All timestamps use UTC. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BikeContract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function requireThat(ok, message) {
    if (!ok) throw new Error(message);
  }
  function text(value, label, max) {
    requireThat(
      typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= max,
      label + " is invalid",
    );
  }
  function timestamp(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value.replace("Z", ".000Z")
    );
  }
  function count(value, label) {
    requireThat(
      value === null ||
        (Number.isInteger(value) && value >= 0 && value <= 1000000),
      label + " must be a non-negative integer or null",
    );
  }
  function coordinates(item) {
    requireThat(
      typeof item.lat === "number" &&
        Number.isFinite(item.lat) &&
        Math.abs(item.lat) <= 90,
      "Invalid latitude",
    );
    requireThat(
      typeof item.lon === "number" &&
        Number.isFinite(item.lon) &&
        Math.abs(item.lon) <= 180,
      "Invalid longitude",
    );
  }
  function validate(data) {
    requireThat(
      data && data.meta && data.meta.schemaVersion === 2,
      "Expected meta.schemaVersion = 2",
    );
    text(data.meta.source, "meta.source", 255);
    requireThat(data.meta.timezone === "UTC", "meta.timezone must be UTC");
    requireThat(Array.isArray(data.stations), "stations must be an array");
    const ids = new Set();
    for (const station of data.stations) {
      text(station.id, "station.id", 80);
      text(station.name, "station.name", 255);
      requireThat(!ids.has(station.id), "Duplicate station ID: " + station.id);
      ids.add(station.id);
      coordinates(station);
      requireThat(
        station.area === null ||
          (typeof station.area === "string" && station.area.length <= 255),
        "area must be a string or null",
      );
      requireThat(
        Array.isArray(station.history),
        "station.history must be an array",
      );
      let previous = "";
      for (const item of station.history) {
        requireThat(
          timestamp(item.recordedAt),
          "recordedAt must be an ISO UTC timestamp with whole seconds",
        );
        requireThat(
          item.recordedAt > previous,
          "History must be sorted with unique timestamps",
        );
        previous = item.recordedAt;
        for (const key of ["bikes", "docks", "capacity", "faults"])
          count(item[key], key);
        requireThat(
          item.isOperational === null ||
            typeof item.isOperational === "boolean",
          "isOperational must be boolean or null",
        );
        if (item.capacity !== null) {
          for (const key of ["bikes", "docks", "faults"])
            requireThat(
              item[key] === null || item[key] <= item.capacity,
              key + " exceeds capacity",
            );
          requireThat(
            item.bikes === null ||
              item.docks === null ||
              item.bikes + item.docks <= item.capacity,
            "bikes + docks exceeds capacity",
          );
        }
      }
    }
    requireThat(
      Array.isArray(data.collisions),
      "collisions must be an array (can be empty)",
    );
    const collisionIds = new Set();
    for (const item of data.collisions) {
      text(item.id, "collision.id", 80);
      text(item.title, "collision.title", 255);
      text(item.source, "collision.source", 255);
      requireThat(!collisionIds.has(item.id), "Duplicate collision ID");
      collisionIds.add(item.id);
      coordinates(item);
      requireThat(
        typeof item.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
          new Date(item.date + "T00:00:00Z").toISOString().slice(0, 10) ===
            item.date,
        "Invalid collision date",
      );
      requireThat(
        typeof item.note === "string" && item.note.length <= 10000,
        "Invalid collision note",
      );
    }
    return data;
  }
  function snapshotAt(history, selected) {
    let lo = 0,
      hi = history.length - 1,
      result = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (history[mid].recordedAt <= selected) {
        result = history[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return result;
  }
  function status(item, mode, selected, maxAge) {
    if (
      !item ||
      (Date.parse(selected) - Date.parse(item.recordedAt)) / 1000 > maxAge
    )
      return "unknown";
    if (item.isOperational === false) return "closed";
    if (item.isOperational === null) return "unknown";
    const value = mode === "borrow" ? item.bikes : item.docks;
    return value === null
      ? "unknown"
      : value === 0
        ? "empty"
        : value <= 5
          ? "limited"
          : "good";
  }
  return { validate, timestamp, snapshotAt, status };
});
