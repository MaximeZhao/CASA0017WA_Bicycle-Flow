'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const config=require('../lib/config');
const db=require('../lib/database');
async function fingerprint(date){const d=await require('../lib/data-source').loadDashboard(date);assert.equal(d.meta.collisionSource,'mysql');return {digest:crypto.createHash('sha256').update(JSON.stringify({stations:d.stations,collisions:d.collisions})).digest('hex'),stations:d.stations.length,observations:d.stations.reduce((n,s)=>n+s.history.length,0),collisions:d.collisions.length};}
async function main(){
 const manifest=JSON.parse(await fs.readFile(path.join(config.root,'sql/snapshot.json'),'utf8'));
 const date=new URL(manifest.recommendedView,'http://localhost').searchParams.get('date');
 if(process.argv.includes('--read')){
  let server;
  try{
   const summary=await fingerprint(date);
   const counts={};for(const table of Object.keys(manifest.counts)){const [r]=await db.getPool().query('SELECT COUNT(*) n FROM ??',[table]);counts[table]=Number(r[0].n);}assert.deepEqual(counts,manifest.counts);
   server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
   for(const route of ['/','/insights.html','/vendor/leaflet.js'])assert.equal((await fetch(base+route)).status,200);
   const response=await fetch(base+'/api/dashboard?date='+date);assert.equal(response.status,200);const payload=await response.json();require('../assets/js/data-contract').validate(payload);assert.equal(payload.meta.mode,'mysql');assert.equal(payload.meta.collisionSource,'mysql');
   const duplicate=await run(process.execPath,[path.join(config.root,'scripts/db-tools.js'),'import'],{cwd:config.root,env:process.env,maxBuffer:1024*1024}).then(()=>false,e=>e.stderr.includes('empty database'));assert.equal(duplicate,true,'second import must refuse non-empty database');
   console.log(JSON.stringify({...summary,withoutLocalDataFiles:true,http:'PASS',duplicateImportGuard:'PASS'}));
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}return;
 }
 const expected=await fingerprint(date);await db.close();
 const testDatabase='bike_v3_import_verify_'+Date.now();
 const admin=await mysql.createConnection({...config.database,database:undefined});let created=false;
 try{
  await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',[testDatabase]);created=true;
  const env={...process.env,DB_NAME:testDatabase,DATA_SOURCE:'mysql',DATA_FILE:path.join(config.root,'data','intentionally-missing-for-import-verification.json')};
  const imported=await run(process.execPath,[path.join(config.root,'scripts/db-tools.js'),'import'],{cwd:config.root,env,maxBuffer:1024*1024});console.log(imported.stdout.trim());
  const verified=await run(process.execPath,[__filename,'--read'],{cwd:config.root,env,maxBuffer:1024*1024});const result=JSON.parse(verified.stdout.trim());assert.equal(result.digest,expected.digest,'restored dashboard must match the source database');console.log(JSON.stringify({result:'PASS',...result}));
 }finally{
  // Only the uniquely named database created above is disposable; source DB is never dropped.
  if(created)await admin.query('DROP DATABASE ??',[testDatabase]);await admin.end();
 }
}
main().catch(error=>{console.error(error.stderr||error.code||error.message);process.exitCode=1;});
