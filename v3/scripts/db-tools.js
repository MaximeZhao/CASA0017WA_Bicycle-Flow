'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const readline=require('node:readline');
const stream=require('node:fs');
const crypto=require('node:crypto');
const {once}=require('node:events');
const mysql=require('mysql2/promise');
const config=require('../lib/config');
const {getPool,close}=require('../lib/database');
const timeline=require('../assets/js/timeline');
const sqlDir=path.join(config.root,'sql');
const tables=['bike_stations','availability_history','collisions','fault_reports','dashboard_stations','dashboard_settings'];
const primary={bike_stations:'station_id',availability_history:'history_id',collisions:'collision_id',fault_reports:'report_id',dashboard_stations:'station_id',dashboard_settings:'setting_key'};
async function executeFile(connection,file){
 const lines=readline.createInterface({input:stream.createReadStream(file),crlfDelay:Infinity});let statement='';let statements=0;
 for await(const line of lines){if(!statement&&(!line.trim()||line.trimStart().startsWith('--')))continue;statement+=line+'\n';if(line.trimEnd().endsWith(';')){await connection.query(statement);statement='';statements++;}}
 if(statement.trim())throw new Error('Incomplete SQL statement at end of '+path.basename(file));return statements;
}
async function init(connection){await executeFile(connection,path.join(sqlDir,'schema.sql'));}
async function importData(connection,file){
 // Refuse to mix a snapshot into an existing database; never erase team data.
 const [existing]=await connection.query('SHOW TABLES');
 for(const row of existing){const name=Object.values(row)[0];if(!tables.includes(name))continue;const [count]=await connection.query('SELECT COUNT(*) n FROM ??',[name]);if(Number(count[0].n)>0)throw new Error('Import requires an empty database. '+name+' already contains data; choose a new DB_NAME.');}
 const manifest=JSON.parse(await fs.readFile(path.join(path.dirname(file),'snapshot.json'),'utf8'));
 const hash=crypto.createHash('sha256');for await(const chunk of stream.createReadStream(file))hash.update(chunk);
 if(hash.digest('hex')!==manifest.sha256)throw new Error('Snapshot checksum mismatch; re-download SQL and snapshot.json together.');
 await init(connection);
 try{await executeFile(connection,file);}catch(e){await connection.rollback();throw e;}
 const actual={};for(const table of tables){const [r]=await connection.query('SELECT COUNT(*) n FROM ??',[table]);actual[table]=Number(r[0].n);if(actual[table]!==manifest.counts[table])throw new Error('Imported row count mismatch: '+table);}
 console.log(JSON.stringify({imported:actual,recommendedView:manifest.recommendedView},null,2));
}
async function seed(connection){
 const base=JSON.parse(await fs.readFile(config.dataFile,'utf8'));
 const {spawnSync}=require('node:child_process');
 const csv=process.argv[3]||path.resolve(config.root,'../v2/data/exports/collisions.csv');
 const parsed=spawnSync('python3',['-c',"import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig',newline='')))))",csv],{encoding:'utf8',maxBuffer:20*1024*1024});
 if(parsed.status!==0)throw new Error('CSV read failed: '+(parsed.stderr||'python3 unavailable'));
 const collisions=JSON.parse(parsed.stdout);
 await init(connection);
 await connection.beginTransaction();
 try{
  const priority=new Set(base.meta.selection.importantStationIds||[]);
  for(const [i,s] of base.stations.entries())await connection.execute('INSERT INTO dashboard_stations (station_id,station_name,latitude,longitude,area,is_priority,selection_reason,display_order) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE station_name=VALUES(station_name),latitude=VALUES(latitude),longitude=VALUES(longitude),area=VALUES(area),is_priority=VALUES(is_priority),selection_reason=VALUES(selection_reason),display_order=VALUES(display_order)',[s.id,s.name,s.lat,s.lon,s.area,priority.has(s.id)?1:0,base.meta.selection.reasons[s.id]||'Original station selection',i]);
  // Existing collision records are never overwritten by the CSV migration.
  for(const c of collisions)await connection.execute('INSERT INTO collisions (collision_id,collision_date,latitude,longitude,location_name,borough,severity,cyclist_involved,casualty_count) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE collision_id=collisions.collision_id',[c.collision_id,c.collision_date?c.collision_date.slice(0,19).replace('T',' '):null,Number(c.latitude),Number(c.longitude),c.location_name||null,c.borough||null,c.severity||null,c.cyclist_involved==='1'?1:0,Number(c.casualty_count)]);
  await connection.execute('INSERT INTO dashboard_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',['presentation',JSON.stringify({bounds:base.meta.selection.bounds,stationLimit:base.stations.length,collisionMapLimit:100,timezone:'Europe/London',source:'Original station selection and collision CSV migrated to MySQL'})]);
  await connection.commit();console.log(JSON.stringify({selectedStations:base.stations.length,collisionRowsProcessed:collisions.length}));
 }catch(e){await connection.rollback();throw e;}
}
async function exportData(connection,file){
 await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp';const out=stream.createWriteStream(temp);const hash=crypto.createHash('sha256');let bytes=0;
 async function write(s){hash.update(s);bytes+=Buffer.byteLength(s);if(!out.write(s))await once(out,'drain');}
 const counts={};let captures=[];
 await connection.query("SET time_zone = '+00:00'");await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 try{
  await write('-- Real project data snapshot; import into an EMPTY database after schema.sql.\n-- Contains no credentials and no DROP/DELETE/TRUNCATE statements.\nSET @snapshot_sql_mode = @@SESSION.sql_mode;\nSET SESSION sql_mode = \'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION\';\nSET NAMES utf8mb4;\nSET time_zone = \'+00:00\';\nSTART TRANSACTION;\n');
  for(const table of tables){
   const [columns]=await connection.query('SHOW COLUMNS FROM ??',[table]);const fields=columns.map(c=>c.Field);counts[table]=0;let cursor=null;
   while(true){const [rows]=cursor===null?await connection.query('SELECT * FROM ?? ORDER BY ?? LIMIT 1000',[table,primary[table]]):await connection.query('SELECT * FROM ?? WHERE ?? > ? ORDER BY ?? LIMIT 1000',[table,primary[table],cursor,primary[table]]);if(!rows.length)break;
    const tuples=rows.map(row=>'('+fields.map(k=>{const value=row[k];return mysql.escape(value&&typeof value==='object'&&!(value instanceof Date)?JSON.stringify(value):value);}).join(',')+')');
    await write('INSERT INTO '+mysql.escapeId(table)+' ('+fields.map(field=>mysql.escapeId(field)).join(',')+') VALUES '+tuples.join(',')+';\n');counts[table]+=rows.length;cursor=rows.at(-1)[primary[table]];
   }
  }
  const [times]=await connection.query('SELECT DISTINCT captured_at FROM availability_history ORDER BY captured_at');captures=times.map(r=>String(r.captured_at).replace(' ','T')+'Z');
  await write('COMMIT;\nSET SESSION sql_mode = @snapshot_sql_mode;\n');await connection.commit();out.end();await once(out,'finish');await fs.rename(temp,file);
 }catch(e){out.destroy();await connection.rollback();await fs.rm(temp,{force:true});throw e;}
 const groups={};for(const t of captures)(groups[timeline.dayOf(t)]??=[]).push(t);
 const demoDate=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length||b.localeCompare(a))[0]||null;
 const target=demoDate?timeline.bounds(demoDate)[0]+8*3600000:0;
 const demoTime=demoDate?groups[demoDate].reduce((a,b)=>Math.abs(Date.parse(a)-target)<Math.abs(Date.parse(b)-target)?a:b):null;
 const [selected]=await connection.query('SELECT station_id FROM dashboard_stations ORDER BY display_order LIMIT 1');
 const query=new URLSearchParams({station:selected[0]?.station_id||'',date:demoDate||'',time:demoTime||'',mode:'borrow'});
 const manifest={snapshotVersion:1,createdAt:new Date().toISOString(),sha256:hash.digest('hex'),bytes,counts,availableDates:Object.keys(groups).sort().reverse(),recommendedView:'/?'+query.toString(),notes:['Real observations; missing periods are preserved.','Import requires an empty database.','SQL timestamps are UTC; the UI displays Europe/London time.']};
 await fs.writeFile(path.join(path.dirname(file),'snapshot.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
}
async function main(){const action=process.argv[2]||'verify';const connection=await getPool().getConnection();try{await connection.query("SET time_zone = '+00:00'");if(action==='init')await init(connection);else if(action==='seed')await seed(connection);else if(action==='export')await exportData(connection,path.resolve(process.argv[3]||path.join(sqlDir,'demo-data.sql')));else if(action==='import')await importData(connection,path.resolve(process.argv[3]||path.join(sqlDir,'demo-data.sql')));else if(action==='verify'){const result={};for(const table of tables){const [r]=await connection.query('SELECT COUNT(*) n FROM ??',[table]);result[table]=Number(r[0].n);}console.log(JSON.stringify(result,null,2));}else throw new Error('Use init|seed|export|import|verify');}finally{connection.release();await close();}}
if(require.main===module)main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
module.exports={executeFile,importData,exportData};
