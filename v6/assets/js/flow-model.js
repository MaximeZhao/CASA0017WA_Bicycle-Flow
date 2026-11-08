(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./timeline'), require('./data-contract'));
  else root.BikeFlowModel = factory(root.BikeTimeline, root.BikeContract);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (timeline, contract) {
  'use strict';
  function summary(stations, timestamp, mode, maxAge) {
    const counts = { good: 0, limited: 0, empty: 0, closed: 0, unknown: 0 };
    let bikes = 0, docks = 0, bikeReports = 0, dockReports = 0;
    for (const station of stations) {
      const item = timeline.freshSnapshot(station.history, timestamp, maxAge);
      counts[contract.status(item, mode, timestamp, maxAge)]++;
      if (!item || item.isOperational !== true) continue;
      if (item.bikes !== null) { bikes += item.bikes; bikeReports++; }
      if (item.docks !== null) { docks += item.docks; dockReports++; }
    }
    return { counts, bikes: bikeReports ? bikes : null, docks: dockReports ? docks : null };
  }
  function segments(history, key, maxGap, through = null) {
    const result = [];
    let points = [], previous = null;
    function flush() { if (points.length) result.push(points); points = []; }
    for (const item of history) {
      if (through && item.recordedAt > through) break;
      if (item[key] === null || item.isOperational !== true) { flush(); previous = null; continue; }
      if (previous && (Date.parse(item.recordedAt) - Date.parse(previous.recordedAt)) / 1000 > maxGap) flush();
      points.push(item);
      previous = item;
    }
    flush();
    return result;
  }
  function barIndexes(times, observations, selected) {
    if (!times.length) return [];
    const indexes = new Set([0, times.length - 1, selected]);
    const source = observations.length ? observations : times;
    const step = Math.max(1, Math.ceil(source.length / 22));
    source.forEach((t, i) => { if (i % step === 0 || i === source.length - 1) indexes.add(times.indexOf(t)); });
    return [...indexes].filter(i => i >= 0 && i < times.length).sort((a, b) => a - b);
  }
  return { summary, segments, barIndexes };
});
