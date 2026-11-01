/* Search real areas and stations in the loaded dataset without a network geocoder. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BikePlaces = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function normalize(text) {
    return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function areaOf(station) {
    return station.area || (station.name.includes(",") ? station.name.split(",").at(-1).trim() : null);
  }
  function build(stations) {
    const areas = new Map();
    for (const station of stations) {
      const name = areaOf(station);
      if (!name) continue;
      const key = normalize(name);
      if (!areas.has(key)) areas.set(key, { id: "area:" + key, type: "area", name, stations: [] });
      areas.get(key).stations.push(station);
    }
    return [
      ...[...areas.values()].map(area => ({ id: area.id, type: area.type, name: area.name, count: area.stations.length,
        bounds: [[Math.min(...area.stations.map(s => s.lat)), Math.min(...area.stations.map(s => s.lon))],
          [Math.max(...area.stations.map(s => s.lat)), Math.max(...area.stations.map(s => s.lon))]] })),
      ...stations.map(station => ({ id: station.id, type: "station", name: station.name, area: areaOf(station), lat: station.lat, lon: station.lon }))
    ];
  }
  function search(places, query, limit = 8) {
    const term = normalize(query);
    if (!term) return [];
    const tokens = term.split(" ");
    return places.map(place => {
      const name = normalize(place.name), haystack = name + " " + normalize(place.id);
      return { place, matches: tokens.every(token => haystack.includes(token)), score: name === term ? 0 : name.startsWith(term) ? 1 : 2 };
    }).filter(item => item.matches).sort((a, b) => a.score - b.score ||
      (a.place.type === b.place.type ? 0 : a.place.type === "area" ? -1 : 1) || a.place.name.localeCompare(b.place.name))
      .slice(0, limit).map(item => item.place);
  }
  return { normalize, areaOf, build, search };
});
