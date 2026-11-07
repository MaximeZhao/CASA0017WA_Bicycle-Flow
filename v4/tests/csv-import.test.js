'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseCSV,utcTime,convertCSV}=require('../lib/csv-import');
const header='collection_hour,station_id,station_name,latitude,longitude,captured_at,bikes,standard_bikes,electric_bikes,empty_docks,total_docks,unavailable_docks,is_locked\r\n';
const csv=header+"1,BikePoints_1,\"Station, \"\"Name\"\"\",51.5,'-0.1,2026-11-04 14:05:41,8,7,1,8,19,3,0\r\n";
test('CSV quoting, coordinate cleaning, counts and repeat imports preserve real observations',()=>{
 const {data,report}=convertCSV(csv,{timezone:'UTC'});assert.equal(report.added,1);assert.equal(data.stations[0].lon,-0.1);assert.equal(data.stations[0].name,'Station, "Name"');assert.equal(data.stations[0].history[0].faults,null);assert.equal(data.stations[0].history[0].unavailableDocks,3);
 const repeated=convertCSV(csv,{timezone:'UTC',base:data});assert.equal(repeated.report.added,0);assert.equal(repeated.report.duplicates,1);assert.equal(repeated.data.stations[0].history.length,1);
 const conflicting=csv.replace(',8,7,1,8,19,3,0',',9,8,1,7,19,3,0');assert.throws(()=>convertCSV(conflicting,{timezone:'UTC',base:data}),/Conflicting existing/);
});
test('invalid and conflicting imports fail without mutating the original dataset',()=>{
 assert.throws(()=>parseCSV(header+'1,broken'),/column count/);
 assert.throws(()=>convertCSV(csv.replace(',8,7,1,8,19,3,0',',8,7,1,9,19,3,0'),{timezone:'UTC'}),/reconcile/);
 assert.throws(()=>convertCSV(csv+csv.split('\r\n')[1],{timezone:'UTC'}),/Duplicate station/);
 assert.throws(()=>convertCSV(csv,{}),/timezone/);
 const base=convertCSV(csv,{timezone:'UTC'}).data;const before=JSON.stringify(base);assert.throws(()=>convertCSV(csv.replace('2026-11-04 14:05:41','2026-02-30 14:05:41'),{timezone:'UTC',base}));assert.equal(JSON.stringify(base),before);
});
test('timezone conversion handles London summer and rejects ambiguous/missing DST times',()=>{
 assert.equal(utcTime('2026-11-04 14:05:41','Europe/London'),'2026-11-04T14:05:41Z');
 assert.equal(utcTime('2026-07-04 14:05:41','Europe/London'),'2026-07-04T13:05:41Z');
 assert.throws(()=>utcTime('2026-10-25 01:30:00','Europe/London'),/Ambiguous/);
 assert.throws(()=>utcTime('2026-03-29 01:30:00','Europe/London'),/nonexistent/);
});
test('simulated_at takes priority over capture time and preserves provenance',()=>{
 const simulated=csv.replace('captured_at,','captured_at,actual_captured_at,simulated_at,is_simulated,').replace('2026-11-04 14:05:41,','2026-11-04 14:05:41,2026/11/5 14:58,2026/1/1 0:00,1,');
 const {data,report}=convertCSV(simulated,{timezone:'UTC'});
 const item=data.stations[0].history[0];
 assert.equal(item.recordedAt,'2026-01-01T00:00:00Z');
 assert.equal(item.actualCapturedAt,'2026-11-05T14:58:00Z');
 assert.equal(item.isSimulated,true);assert.equal(report.timeColumn,'simulated_at');
 const withoutCaptured=simulated.replace('captured_at,actual_captured_at,','actual_captured_at,').replace('2026-11-04 14:05:41,','');
 assert.equal(convertCSV(withoutCaptured,{timezone:'UTC'}).data.stations[0].history[0].recordedAt,item.recordedAt);
 assert.throws(()=>convertCSV(withoutCaptured.replace('2026/1/1 0:00',''),{timezone:'UTC'}),/Invalid captured_at/);
 assert.throws(()=>convertCSV(withoutCaptured.replace('2026/1/1 0:00','2026/2/30 0:00'),{timezone:'UTC'}),/Invalid captured_at/);
 assert.equal(convertCSV(withoutCaptured,{timezone:'UTC',base:data}).report.duplicates,1);
});
