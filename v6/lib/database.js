'use strict';
const mysql=require('mysql2/promise');
const config=require('./config');
const timeline=require('../assets/js/timeline');
let pool;
function getPool(){return pool||(pool=mysql.createPool({...config.database,connectTimeout:15000}));}
async function close(){if(pool){await pool.end();pool=null;}}
function utc(value){return (value instanceof Date?value.toISOString():String(value).replace(' ','T')+'Z').replace('.000Z','Z');}
function sqlTime(ms){return new Date(ms).toISOString().slice(0,19).replace('T',' ');}
async function readDataset(requested){
 const connection=await getPool().getConnection();
 try{
  await connection.query("SET time_zone = '+00:00'");
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const [days]=await connection.query('SELECT DISTINCT DATE(captured_at) AS day FROM availability_history ORDER BY day DESC');
  // Convert UTC database days to possible local days, then confirm with indexed range lookups.
  const candidates=new Set();
  for(const row of days){const day=String(row.day).slice(0,10);candidates.add(timeline.dayOf(day+'T00:00:00Z'));candidates.add(timeline.dayOf(day+'T23:59:59Z'));}
  const dates=[];
  for(const date of [...candidates].sort().reverse()){
   const [start,end]=timeline.bounds(date);
   const [exists]=await connection.execute('SELECT history_id FROM availability_history WHERE captured_at >= ? AND captured_at < ? LIMIT 1',[sqlTime(start),sqlTime(end)]);
   if(exists.length)dates.push(date);
  }
  const date=requested||dates[0]||timeline.dayOf(new Date().toISOString());
  const [stationRows]=await connection.query('SELECT d.*,b.station_name current_name,b.latitude current_lat,b.longitude current_lon FROM dashboard_stations d LEFT JOIN bike_stations b ON b.station_id=d.station_id ORDER BY d.display_order,d.station_id');
  if(!stationRows.length)throw new Error('No dashboard stations. Import sql/schema.sql and sql/demo-data.sql into this database.');
  const stations=stationRows.map(s=>({id:s.station_id,name:s.current_name||s.station_name,lat:Number(s.current_lat??s.latitude),lon:Number(s.current_lon??s.longitude),area:s.area,history:[]}));
  const stationMap=new Map(stations.map(s=>[s.id,s]));
  const [settingRows]=await connection.execute('SELECT setting_value FROM dashboard_settings WHERE setting_key=?',['presentation']);
  const profile=settingRows.length?(typeof settingRows[0].setting_value==='string'?JSON.parse(settingRows[0].setting_value):settingRows[0].setting_value):{};
  const [start,end]=timeline.bounds(date);
  // Large prepared IN lists are slow on this database; filter the day's rows in memory.
  const [dayRows]=await connection.execute('SELECT history_id,station_id,bikes,empty_docks,total_docks,is_locked,captured_at FROM availability_history WHERE captured_at >= ? AND captured_at < ?',[sqlTime(start),sqlTime(end)]);
  const history=dayRows.filter(h=>stationMap.has(h.station_id));
  history.sort((a,b)=>String(a.captured_at).localeCompare(String(b.captured_at)) || Number(a.history_id)-Number(b.history_id));
  for(const h of history){const station=stationMap.get(h.station_id);const sample={recordedAt:utc(h.captured_at),bikes:h.bikes,docks:h.empty_docks,capacity:h.total_docks,isOperational:h.is_locked===null?null:!Boolean(h.is_locked),faults:null};
   // Repeated imports of the same station/time are represented once, using the latest row.
   if(station.history.at(-1)?.recordedAt===sample.recordedAt)station.history[station.history.length-1]=sample;else station.history.push(sample);
  }
  const bounds=profile.bounds||[Math.min(...stationRows.map(s=>Number(s.latitude))),Math.min(...stationRows.map(s=>Number(s.longitude))),Math.max(...stationRows.map(s=>Number(s.latitude))),Math.max(...stationRows.map(s=>Number(s.longitude)))];
  const [collisions]=await connection.execute('SELECT * FROM collisions WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY collision_date,collision_id',[bounds[0],bounds[2],bounds[1],bounds[3]]);
  await connection.commit();
  return {meta:{schemaVersion:2,source:'MySQL · '+stations.length+' selected stations · original historical observations and collisions',date,availableDates:dates,timezone:'UTC',collisionSource:'mysql',selection:{bounds,importantStationIds:stationRows.filter(s=>s.is_priority).map(s=>s.station_id),reasons:Object.fromEntries(stationRows.map(s=>[s.station_id,s.selection_reason]))}},stations,collisions:collisions.filter(c=>c.collision_date).map(c=>({id:c.collision_id,title:(c.severity||'Recorded')+' cycle collision',date:utc(c.collision_date).slice(0,10),lat:Number(c.latitude),lon:Number(c.longitude),note:'Original collision record; casualties: '+c.casualty_count,source:'MySQL historical collisions'}))};
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
module.exports={getPool,close,readDataset};
