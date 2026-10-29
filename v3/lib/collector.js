'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const config=require('./config');
const {getPool}=require('./database');
const statePath=path.join(config.root,'data/collector-status.json');
function integer(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
function normalize(station){
 const p=Object.fromEntries((station.additionalProperties||[]).map(p=>[p.key,p.value]));
 const bikes=integer(p.NbBikes),capacity=integer(p.NbDocks),docks=integer(p.NbEmptyDocks??p.NbSpaces),standard=integer(p.NbStandardBikes),electric=integer(p.NbEBikes);
 const lat=station.lat,lon=station.lon;
 if(!station.id||!station.commonName||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||[bikes,capacity,docks,standard,electric].includes(null)||bikes+docks>capacity||standard+electric>bikes||!['true','false'].includes(p.Locked)||p.Installed==='false')return null;
 const modified=(station.additionalProperties||[]).find(p=>p.key==='NbBikes')?.modified;
 return {id:station.id,name:station.commonName,lat,lon,bikes,capacity,docks,standard,electric,unavailable:capacity-bikes-docks,locked:p.Locked==='true'?1:0,modified:modified&&Number.isFinite(Date.parse(modified))?new Date(modified).toISOString().slice(0,19).replace('T',' '):null};
}
function sqlTime(ms){return new Date(ms).toISOString().slice(0,19).replace('T',' ');}
async function saveStatus(patch){let old={};try{old=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{}const value={...old,...patch,intervalSeconds:300};const temp=statePath+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,statePath);return value;}
async function collectOnce(options={}){
 const persist=options.saveStatus||saveStatus;
 const now=options.now||Date.now();const connection=await (options.pool||getPool()).getConnection();let locked=false,transaction=false;
 try{
  const [lock]=await connection.query("SELECT GET_LOCK('bike_pulse_v3_collection',0) acquired");locked=Number(lock[0].acquired)===1;if(!locked)return {status:'already-running'};
  await connection.query("SET time_zone = '+00:00'");
  const [recent]=await connection.execute('SELECT MAX(captured_at) latest FROM availability_history');
  const latest=recent[0].latest;
  if(latest&&Date.parse(String(latest).replace(' ','T').replace(/Z$/,'')+'Z')>=Math.floor(now/300000)*300000)return await persist({status:'waiting',checkedAt:new Date(now).toISOString()});
  const response=await (options.fetch||fetch)('https://api.tfl.gov.uk/BikePoint',{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('TfL HTTP '+response.status);
  const rows=await response.json();if(!Array.isArray(rows)||!rows.length)throw new Error('TfL returned no station array');
  const samples=rows.map(normalize).filter(Boolean);if(!samples.length)throw new Error('No valid stations to collect');
  const capturedAt=sqlTime(options.now||Date.now());
  await connection.beginTransaction();transaction=true;
  for(const s of samples){
   await connection.execute(`INSERT INTO bike_stations (station_id,station_name,latitude,longitude,total_docks,current_bikes,standard_bikes,electric_bikes,empty_docks,unavailable_docks,is_locked,api_modified_at,last_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE station_name=VALUES(station_name),latitude=VALUES(latitude),longitude=VALUES(longitude),total_docks=VALUES(total_docks),current_bikes=VALUES(current_bikes),standard_bikes=VALUES(standard_bikes),electric_bikes=VALUES(electric_bikes),empty_docks=VALUES(empty_docks),unavailable_docks=VALUES(unavailable_docks),is_locked=VALUES(is_locked),api_modified_at=VALUES(api_modified_at),last_updated=VALUES(last_updated)`,[s.id,s.name,s.lat,s.lon,s.capacity,s.bikes,s.standard,s.electric,s.docks,s.unavailable,s.locked,s.modified,capturedAt]);
   await connection.execute('INSERT INTO availability_history (station_id,bikes,standard_bikes,electric_bikes,empty_docks,total_docks,unavailable_docks,is_locked,captured_at) VALUES (?,?,?,?,?,?,?,?,?)',[s.id,s.bikes,s.standard,s.electric,s.docks,s.capacity,s.unavailable,s.locked,capturedAt]);
  }
  await connection.commit();transaction=false;
  return await persist({status:'ok',lastAttempt:new Date().toISOString(),lastSuccess:capturedAt.replace(' ','T')+'Z',imported:samples.length,skipped:rows.length-samples.length,error:null});
 }catch(error){if(transaction)await connection.rollback();await persist({status:'error',lastAttempt:new Date().toISOString(),error:error.code||error.message});throw error;}finally{if(locked)await connection.query("SELECT RELEASE_LOCK('bike_pulse_v3_collection')").catch(()=>{});connection.release();}
}
module.exports={integer,normalize,collectOnce};
