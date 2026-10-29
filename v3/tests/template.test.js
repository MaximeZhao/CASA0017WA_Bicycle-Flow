'use strict';
process.env.DATA_SOURCE='json';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../data/showcase.json');
const {validate,snapshotAt}=require('../assets/js/data-contract');
const {createServer}=require('../server');
test('showcase contains bounded real observations and no invented faults',()=>{
 validate(data); assert.equal(data.stations.length,400);assert.ok(data.collisions.length===2288);
 assert.equal(data.stations.reduce((n,s)=>n+s.history.length,0),405);
 for(const s of data.stations){assert.ok(s.id.startsWith('BikePoints_'));assert.ok(s.history.every(h=>h.faults===null));}
 for (const key of ['Waterloo Station 1','Pancras Road','Euston Road','London Street, Paddington','Duke Street Hill','British Museum','Jubilee Plaza']) assert.ok(data.stations.some(s=>s.name.includes(key)),key);
 assert.ok(data.collisions.every(c=>c.date.startsWith('2025-')));
});
test('early playback leaves stations with no past observation unknown',()=>{
 const times=[...new Set(data.stations.flatMap(s=>s.history.map(h=>h.recordedAt)))].sort();
 assert.equal(times.length,2);
 assert.equal(data.stations.filter(s=>snapshotAt(s.history,times[0])).length,5);
 assert.equal(data.stations.filter(s=>snapshotAt(s.history,times[1])).length,400);
});
test('real JSON backend serves both pages and filtering without exposing private files',async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const result=await fetch(base+'/api/dashboard');assert.equal(result.status,200);const payload=await result.json();validate(payload);assert.equal(payload.meta.mode,'json');assert.equal(payload.stations.length,400);assert.equal(payload.collisions.length,2288);
  const collection=await(await fetch(base+'/api/collection-status')).json();assert.equal(collection.intervalSeconds,300);assert.ok(!Object.hasOwn(collection,'password'));
  for(const url of ['/','/insights.html','/vendor/leaflet.js','/vendor/leaflet.css'])assert.equal((await fetch(base+url)).status,200);
  for(const url of ['/.env','/server.js','/data/showcase.json'])assert.equal((await fetch(base+url)).status,404);
  assert.equal((await fetch(base+'/api/dashboard?date=not-a-date')).status,400);
  const empty=await(await fetch(base+'/api/dashboard?date=2020-01-01')).json();assert.ok(empty.meta.timestamps.length>=289);assert.ok(empty.stations.every(s=>s.history.length===0));assert.equal(payload.meta.displayTimezone,"Europe/London");assert.equal(payload.meta.observationTimestamps.length,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
