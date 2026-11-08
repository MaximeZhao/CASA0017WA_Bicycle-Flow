'use strict';
const {validate}=require('../assets/js/data-contract');
const required=['collection_hour','station_id','station_name','latitude','longitude','bikes','standard_bikes','electric_bikes','empty_docks','total_docks','unavailable_docks','is_locked'];
function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||closed)throw new Error('Invalid CSV quoting');quoted=true;continue;}
    if(c===','||c==='\r'||c==='\n'){row.push(cell);cell='';closed=false;if(c!==','){if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
    if(closed)throw new Error('Unexpected characters after a quoted CSV field');cell+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(cell||row.length||closed){row.push(cell);rows.push(row);}
  const header=rows.shift();if(!header)throw new Error('Empty CSV');
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV columns');
  for(const name of required)if(!header.includes(name))throw new Error('Missing CSV column: '+name);
  if(!header.includes('simulated_at')&&!header.includes('captured_at'))throw new Error('Missing CSV column: simulated_at or captured_at');
  return rows.map((values,i)=>{if(values.length!==header.length)throw new Error('Wrong column count at CSV row '+(i+2));return Object.fromEntries(header.map((h,j)=>[h,values[j]]));});
}
function utcTime(value,zone){
  if(!['UTC','Europe/London'].includes(zone))throw new Error('Specify --timezone UTC or Europe/London');
  const slash=/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if(slash){const [,y,m,d,h,min,sec='00']=slash;value=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')} ${h.padStart(2,'0')}:${min}:${sec}`;}
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))throw new Error('Invalid captured_at: '+value);
  const target=Date.parse(value.replace(' ','T')+'Z');
  if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,19)!==value.replace(' ','T'))throw new Error('Invalid captured_at: '+value);
  if(zone==='UTC')return new Date(target).toISOString().replace('.000Z','Z');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const matches=[];
  for(const offset of [0,3600000]){const ms=target-offset,p=Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));if(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`===value)matches.push(ms);}
  if(matches.length!==1)throw new Error('Ambiguous or nonexistent London time: '+value+'; export UTC instead');
  return new Date(matches[0]).toISOString().replace('.000Z','Z');
}
function convertCSV(text,{timezone,base,replace=false,sourceName='CSV'}={}){
  if(!['UTC','Europe/London'].includes(timezone))throw new Error('Specify --timezone UTC or Europe/London');
  const rows=parseCSV(text);if(!rows.length)throw new Error('CSV has no observations');
  const timeColumn=Object.hasOwn(rows[0],'simulated_at')?'simulated_at':'captured_at';
  const stations=new Map((replace?[]:base?.stations||[]).map(s=>[s.id,{...s,history:s.history.map(h=>({...h}))}]));
  const metadata=new Map(),seen=new Set(),timeCache=new Map();let added=0,duplicates=0;
  function number(row,key,coordinate=false){const value=row[key].trim().replace(/^'/,'');if(!value)throw new Error('Missing '+key);const n=Number(value);if(!Number.isFinite(n)||(!coordinate&&(!Number.isInteger(n)||n<0)))throw new Error('Invalid '+key);return n;}
  for(const [i,row] of rows.entries()){
    try{
      const id=row.station_id.trim(),name=row.station_name.trim();if(!/^BikePoints_\d+$/.test(id)||!name)throw new Error('Invalid station identity');
      const lat=number(row,'latitude',true),lon=number(row,'longitude',true);
      const signature=JSON.stringify([name,lat,lon]);if(metadata.has(id)&&metadata.get(id)!==signature)throw new Error('Conflicting station metadata: '+id);metadata.set(id,signature);
      const hour=number(row,'collection_hour');if(hour<1)throw new Error('Invalid collection_hour');
      const time=row[timeColumn];
      if(!timeCache.has(time))timeCache.set(time,utcTime(time,timezone));
      const recordedAt=timeCache.get(time),key=id+'|'+recordedAt;
      if(seen.has(key))throw new Error('Duplicate station/time inside CSV');seen.add(key);
      const bikes=number(row,'bikes'),standardBikes=number(row,'standard_bikes'),electricBikes=number(row,'electric_bikes'),docks=number(row,'empty_docks'),capacity=number(row,'total_docks'),unavailableDocks=number(row,'unavailable_docks');
      if(bikes!==standardBikes+electricBikes||capacity!==bikes+docks+unavailableDocks)throw new Error('Counts do not reconcile');
      if(!['0','1'].includes(row.is_locked))throw new Error('Invalid is_locked');
      const item={recordedAt,bikes,docks,capacity,isOperational:row.is_locked==='0',faults:null,standardBikes,electricBikes,unavailableDocks};
      if(timeColumn==='simulated_at'){
        if(row.is_simulated!==undefined&&!['0','1'].includes(row.is_simulated))throw new Error('Invalid is_simulated');
        item.isSimulated=true;
        if(row.actual_captured_at)item.actualCapturedAt=utcTime(row.actual_captured_at,timezone);
      }
      let station=stations.get(id);
      if(!station){station={id,name,lat,lon,area:null,history:[]};stations.set(id,station);}else Object.assign(station,{name,lat,lon});
      const previous=station.history.find(h=>h.recordedAt===recordedAt);
      if(previous){if(JSON.stringify(previous)!==JSON.stringify(item))throw new Error('Conflicting existing observation; import refused');duplicates++;}else{station.history.push(item);added++;}
    }catch(error){throw new Error('CSV row '+(i+2)+': '+error.message);}
  }
  for(const station of stations.values())station.history.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  const times=[...timeCache.values()].sort();
  const gaps=times.slice(1).map((t,i)=>(Date.parse(t)-Date.parse(times[i]))/1000).sort((a,b)=>a-b);
  const cadence=gaps.length?gaps[Math.floor(gaps.length/2)]:null;
  const imports=replace?[]:[...(base?.meta.imports||[])];
  const entry={file:sourceName,timezone,timeColumn,rows:rows.length,stations:metadata.size,first:times[0],last:times.at(-1)};
  if(!imports.some(e=>JSON.stringify(e)===JSON.stringify(entry)))imports.push(entry);
  const isSimulated=imports.some(e=>e.timeColumn==='simulated_at');
  const data={meta:{schemaVersion:2,timezone:'UTC',source:isSimulated?'Imported TfL CSV; simulated hourly playback':'Imported TfL CSV observations; recorded playback',isSimulated,playbackMode:'observations',sampleIntervalSeconds:cadence,imports},stations:[...stations.values()],collisions:base?.collisions||[]};
  validate(data);
  return {data,report:{...entry,added,duplicates,totalStations:data.stations.length,totalObservations:data.stations.reduce((n,s)=>n+s.history.length,0),collisions:data.collisions.length,sampleIntervalSeconds:cadence}};
}
module.exports={parseCSV,utcTime,convertCSV};
