'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../assets/js/flow-model');
const dataset = require('../data/history.json');
const first = '2026-11-05T14:00:00Z';
const item = (time, bikes, docks, operational = true) => ({ recordedAt: time, bikes, docks, isOperational: operational });
test('network bars use each timestamp and borrow / return mode rather than fixed distributions', () => {
  const stations = [{ history: [item('2026-11-05T14:00:00Z', 0, 10), item('2026-11-05T15:00:00Z', 8, 2)] }];
  const borrow = flow.summary(stations, first, 'borrow', 900);
  const returns = flow.summary(stations, first, 'return', 900);
  assert.equal(borrow.counts.empty, 1); assert.equal(returns.counts.good, 1);
  const later = flow.summary(stations, '2026-11-05T15:00:00Z', 'borrow', 900);
  assert.equal(later.counts.good, 1); assert.equal(later.bikes, 8); assert.equal(later.docks, 2);
  assert.equal(flow.summary(stations, '2026-11-05T16:00:00Z', 'borrow', 900).counts.unknown, 1);
});
test('line segments advance to the selected sample and break at missing or stale gaps', () => {
  const h = [item(first, 1, 9), item('2026-11-05T15:00:00Z', 8, 2), item('2026-11-05T16:00:00Z', null, 2), item('2026-11-05T17:00:00Z', 2, 8), item('2026-11-05T20:00:00Z', 6, 4)];
  assert.deepEqual(flow.segments(h, 'bikes', 3720, first).map(s => s.map(h => h.bikes)), [[1]]);
  assert.deepEqual(flow.segments(h, 'bikes', 3720).map(s => s.map(h => h.bikes)), [[1, 8], [2], [6]]);
});
test('bundled dates and stations retain their actual different observations without inventing variation', () => {
  const river = dataset.stations.find(s => s.id === 'BikePoints_1');
  const nov5 = river.history.filter(h => h.recordedAt.startsWith('2026-11-05'));
  const nov7 = river.history.filter(h => h.recordedAt.startsWith('2026-11-07'));
  assert.ok(new Set(nov5.map(h => h.bikes)).size > 2);
  assert.equal(nov7.at(-1).bikes, 5); assert.equal(nov7.at(-1).docks, 8);
  const times = nov7.map(h => h.recordedAt);
  assert.equal(flow.barIndexes(times, times, 5).length, times.length);
  const before = flow.summary(dataset.stations, nov5[0].recordedAt, 'borrow', 900);
  const later = flow.summary(dataset.stations, nov5.at(-1).recordedAt, 'borrow', 900);
  assert.notDeepEqual(before, later);
});
