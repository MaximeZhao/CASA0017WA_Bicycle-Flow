'use strict';
// Keep the original 24-hour observations, then append two simulated 24-hour blocks.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {parseCSV,convertCSV}=require('../lib/csv-import');
const root=path.resolve(__dirname,'..');
const sourceDir=path.join(root,'data/imports');
const original='e4946b3bee58-TfL_Bike_Availability_24H.csv';
const mappings=[
  {original:'TfL_Bike_24H_SIMULATED(3).csv',file:'TfL_Bike_24H_SIMULATED-day2.csv',start:'2026-11-05T14:00:00Z'},
  {original:'TfL_Bike_24H_SIMULATED(2).csv',file:'TfL_Bike_24H_SIMULATED-day3.csv',start:'2026-11-06T14:00:00Z'},
];
const target=path.join(root,'data/history.json');
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const outputs=new Map([[original,fs.readFileSync(path.join(sourceDir,original))]]);
for(const mapping of mappings){
  const rows=parseCSV(fs.readFileSync(path.join(sourceDir,mapping.original),'utf8')).map(row=>{
    const hour=Number(row.collection_hour);
    if(!Number.isInteger(hour)||hour<1||hour>24)throw new Error('Expected collection_hour 1–24');
    const simulated_at=new Date(Date.parse(mapping.start)+(hour-1)*3600000).toISOString().slice(0,19).replace('T',' ');
    return {...row,original_simulated_at:row.simulated_at,simulated_at};
  });
  const columns=Object.keys(rows[0]);
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
  const csv=[columns.map(quote).join(','),...rows.map(row=>columns.map(key=>quote(row[key])).join(','))].join('\n')+'\n';
  outputs.set(mapping.file,Buffer.from(csv));
}
const reports=[];
let data={meta:{},stations:[],collisions:base.collisions};
for(const [file,bytes] of outputs){
  const result=convertCSV(bytes.toString('utf8'),{timezone:'UTC',base:data,sourceName:file});
  data=result.data;
  reports.push({...result.report,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const report={dates:['2026-11-04','2026-11-05','2026-11-06','2026-11-07'],timezone:'UTC',
  normalization:{mappings,rule:'New simulated_at = block start + (collection_hour - 1) hours; original captured_at and actual_captured_at are unchanged'},
  totalStations:data.stations.length,totalObservations:data.stations.reduce((n,s)=>n+s.history.length,0),collisions:data.collisions.length,imports:reports};
const backup=path.join(root,'data/backups');fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(target,path.join(backup,'history-before-three-days-'+Date.now()+'.json'));
for(const mapping of mappings)fs.writeFileSync(path.join(sourceDir,mapping.file),outputs.get(mapping.file));
fs.writeFileSync(target+'.tmp',JSON.stringify(data)+'\n');fs.renameSync(target+'.tmp',target);
fs.writeFileSync(path.join(root,'data/import-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
