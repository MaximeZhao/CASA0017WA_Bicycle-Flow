'use strict';
process.env.DATA_SOURCE='json';
const test=require('node:test'),assert=require('node:assert/strict');
const timeline=require('../assets/js/timeline');
const {selectDate,loadDashboard}=require('../lib/data-source');
const data=require('../data/showcase.json');
test('London full day includes midnight, 23:59 and exact original observations',async()=>{
 const loaded=await loadDashboard('2026-10-23');
 assert.equal(timeline.clock(loaded.meta.timestamps[0]),'00:00');
 assert.equal(timeline.clock(loaded.meta.timestamps.at(-1)),'23:59');
 assert.equal(timeline.clock(loaded.meta.defaultTime),'15:11');
 assert.equal(loaded.meta.timestamps.length,291);
 assert.deepEqual(loaded.stations,data.stations);
 assert.ok(loaded.meta.observationTimestamps.every(t=>loaded.meta.timestamps.includes(t)));
});
test('missing periods do not reuse old observations or invent future records',()=>{
 const station=data.stations.find(s=>s.history.length===2),h=station.history.at(-1);
 assert.equal(timeline.freshSnapshot(station.history,'2026-10-23T10:00:00Z',900),null);
 assert.equal(timeline.freshSnapshot(station.history,'2026-10-23T20:00:00Z',900),null);
 assert.equal(timeline.freshSnapshot(station.history,h.recordedAt,900),h);
 assert.equal(timeline.freshSnapshot(station.history,new Date(Date.parse(h.recordedAt)+900000).toISOString(),900),h);
 assert.equal(timeline.freshSnapshot(station.history,new Date(Date.parse(h.recordedAt)+901000).toISOString(),900),null);
});
test('London date filtering and navigation retain observations crossing UTC midnight',()=>{
 const copy=structuredClone(data);copy.stations[0].history=[{...copy.stations[0].history[0],recordedAt:'2026-10-22T23:30:00Z'}];
 assert.equal(selectDate(copy,'2026-10-23').stations[0].history.length,1);
 assert.equal(selectDate(copy,'2026-10-22').stations[0].history.length,0);
 const nav=require('../assets/js/site-navigation');
 assert.equal(nav.parse('?date=2026-10-23&time=2026-10-22T23%3A30%3A00Z').time,'2026-10-22T23:30:00Z');
});
test('London DST transition days contain 23 or 25 hours without invalid local times',()=>{
 assert.equal(timeline.fullDay('2026-03-29').length,277);
 assert.equal(timeline.fullDay('2026-10-25').length,301);
 assert.ok(timeline.fullDay('2026-03-29').every(t=>!timeline.clock(t).startsWith('01:')));
 assert.equal(timeline.fullDay('2026-10-25').filter(t=>timeline.clock(t)==='01:00').length,2);
});
