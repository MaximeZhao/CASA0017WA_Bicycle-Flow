'use strict';
process.env.DATA_SOURCE='json';process.env.DATA_FILE=require('node:path').resolve(__dirname,'../data/history.json');
const fs=require('node:fs'),path=require('node:path');
const test=require('node:test'),assert=require('node:assert/strict');
const {loadDashboard}=require('../lib/data-source');
const {convertCSV}=require('../lib/csv-import');
test('three 24-hour datasets continue from the original November captures',async()=>{
 const dates=['2026-11-04','2026-11-05','2026-11-06','2026-11-07'];
 const expected=[7964,19080,19080,11130],slots=[10,24,24,14];
 for(const [index,date] of dates.entries()){
  const day=await loadDashboard(date);
  assert.equal(day.stations.length,797);
  assert.equal(day.stations.reduce((n,s)=>n+s.history.length,0),expected[index]);
  assert.equal(day.meta.timestamps.length,slots[index]);
  assert.deepEqual(day.meta.availableDates,[...dates].reverse());
  assert.equal(day.collisions.length,2288);
  assert.ok(day.stations.every(s=>s.history.every(h=>h.recordedAt.startsWith(date)&&h.faults===null&&h.bikes===h.standardBikes+h.electricBikes)));
 }
 const latest=await loadDashboard();assert.equal(latest.meta.date,'2026-11-07');assert.equal(latest.meta.defaultTime,'2026-11-07T13:00:00Z');
 const all=JSON.parse(fs.readFileSync(process.env.DATA_FILE,'utf8'));
 const times=[...new Set(all.stations.flatMap(s=>s.history.map(h=>h.recordedAt)))].sort();
 assert.equal(times.length,72);assert.equal(times[0],'2026-11-04T14:05:41Z');assert.equal(times.at(-1),'2026-11-07T13:00:00Z');
 assert.ok(times.slice(1).every((t,i)=>Date.parse(t)-Date.parse(times[i])<3720000));
 const original=convertCSV(fs.readFileSync(path.resolve(__dirname,'../data/imports/e4946b3bee58-TfL_Bike_Availability_24H.csv'),'utf8'),{timezone:'UTC'}).data;
 for(const station of original.stations){
  const current=all.stations.find(s=>s.id===station.id);
  assert.deepEqual(current.history.filter(h=>!h.isSimulated),station.history);
 }
 assert.equal(all.stations.reduce((n,s)=>n+s.history.filter(h=>h.isSimulated).length,0),38160);
 assert.ok(all.stations.every(s=>s.history.filter(h=>h.isSimulated).every(h=>h.actualCapturedAt.startsWith('2026-11-'))));
});
