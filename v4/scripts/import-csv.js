'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {convertCSV}=require('../lib/csv-import');
function main(args){
  const file=args.shift();let timezone,replace=false;
  while(args.length){const option=args.shift();if(option==='--timezone')timezone=args.shift();else if(option==='--replace')replace=true;else throw new Error('Unknown option: '+option);}
  if(!file)throw new Error('Usage: npm run data:import -- "file.csv" --timezone UTC [--replace]');
  const root=path.resolve(__dirname,'..'),target=path.join(root,'data/history.json');
  const bytes=fs.readFileSync(path.resolve(file));const base=JSON.parse(fs.readFileSync(target,'utf8'));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const result=convertCSV(bytes.toString('utf8'),{timezone,base,replace,sourceName:path.basename(file)});
  const rawDir=path.join(root,'data/imports'),backupDir=path.join(root,'data/backups');
  fs.mkdirSync(rawDir,{recursive:true});fs.mkdirSync(backupDir,{recursive:true});
  fs.copyFileSync(target,path.join(backupDir,'history-'+Date.now()+'.json'));
  fs.writeFileSync(path.join(rawDir,hash.slice(0,12)+'-'+path.basename(file)),bytes);
  const temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(result.data)+'\n');fs.renameSync(temp,target);
  fs.writeFileSync(path.join(root,'data/import-report.json'),JSON.stringify({...result.report,sha256:hash},null,2)+'\n');
  console.log(JSON.stringify(result.report,null,2));
}
if(require.main===module)try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={main};
