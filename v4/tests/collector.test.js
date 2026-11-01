'use strict';
process.env.DATA_SOURCE='json';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,collectOnce}=require('../lib/collector');
function station(){return {id:'BikePoints_test',commonName:'Original test fixture',lat:51.5,lon:-.12,additionalProperties:Object.entries({NbBikes:'3',NbDocks:'10',NbEmptyDocks:'5',NbStandardBikes:'2',NbEBikes:'1',Locked:'false',Installed:'true'}).map(([key,value])=>({key,value}))};}
test('collector reads real standard/electric fields and rejects missing or impossible values',()=>{
 const s=station();assert.equal(normalize(s).standard,2);assert.equal(normalize(s).electric,1);assert.equal(normalize(s).unavailable,2);
 s.additionalProperties=s.additionalProperties.filter(p=>p.key!=='NbEBikes');assert.equal(normalize(s),null);
 const invalid=station();invalid.additionalProperties.find(p=>p.key==='NbBikes').value='20';assert.equal(normalize(invalid),null);
});
function fakePool(fail=false,recent=null){const calls=[];const connection={query:async sql=>{calls.push(sql);return [[{acquired:1}]];},execute:async sql=>{calls.push(sql);if(sql.startsWith('SELECT MAX'))return [[{latest:recent}]];if(fail&&sql.startsWith('INSERT INTO availability'))throw new Error('fixture failure');return [{}];},beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};return {pool:{getConnection:async()=>connection},calls};}
const fakeFetch=async()=>({ok:true,json:async()=>[station()]});
test('collector commits current state and appended history together',async()=>{const f=fakePool();const result=await collectOnce({pool:f.pool,fetch:fakeFetch,now:Date.parse('2026-10-28T10:00:00Z'),saveStatus:async s=>s});assert.equal(result.imported,1);assert.ok(f.calls.some(s=>s.startsWith('INSERT INTO availability_history')));assert.ok(f.calls.includes('commit'));assert.ok(!f.calls.includes('rollback'));assert.ok(f.calls.includes('release'));});
test('failed history insert rolls back station changes and releases the connection',async()=>{const f=fakePool(true);await assert.rejects(collectOnce({pool:f.pool,fetch:fakeFetch,now:Date.parse('2026-10-28T10:00:00Z'),saveStatus:async s=>s}),/fixture failure/);assert.ok(f.calls.includes('rollback'));assert.ok(!f.calls.includes('commit'));assert.ok(f.calls.includes('release'));});
test('same five-minute bucket does not create duplicate collections',async()=>{const f=fakePool(false,'2026-10-28 10:01:00');const result=await collectOnce({pool:f.pool,fetch:()=>{throw new Error('should not fetch');},now:Date.parse('2026-10-28T10:02:00Z'),saveStatus:async s=>s});assert.equal(result.status,'waiting');assert.ok(!f.calls.includes('begin'));});
