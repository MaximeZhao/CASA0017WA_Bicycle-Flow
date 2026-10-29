(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BikeTimeline=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const timezone='Europe/London';
 const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const clockFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function dayOf(timestamp){const p=Object.fromEntries(dateFormatter.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;}
 function clock(timestamp){return timestamp?clockFormatter.format(new Date(timestamp)):'—';}
 function midnight(day){const target=Date.parse(day+'T00:00:00Z');let value=target;for(let i=0;i<3;i++){const local=Date.parse(dayOf(new Date(value).toISOString())+'T'+clock(new Date(value).toISOString())+':00Z');value+=target-local;}return value;}
 function bounds(day){const next=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);return [midnight(day),midnight(next)];}
 function iso(ms){return new Date(ms).toISOString().replace('.000Z','Z');}
 function fullDay(day,observations=[]){if(!day)return [];const [start,end]=bounds(day);const times=[];for(let t=start;t<end;t+=300000)times.push(iso(t));times.push(iso(end-60000));return [...new Set([...times,...observations.filter(t=>Date.parse(t)>=start&&Date.parse(t)<end)])].sort();}
 function freshSnapshot(history,selected,maxAge){let lo=0,hi=history.length-1,result=null;while(lo<=hi){const mid=(lo+hi)>>1;if(history[mid].recordedAt<=selected){result=history[mid];lo=mid+1;}else hi=mid-1;}return result&&(Date.parse(selected)-Date.parse(result.recordedAt))/1000<=maxAge?result:null;}
 function tickIndexes(times){return times.map((t,i)=>i).filter(i=>i===0||i===times.length-1||/^(00|03|06|09|12|15|18|21):00$/.test(clock(times[i])));}
 return {timezone,dayOf,clock,bounds,fullDay,freshSnapshot,tickIndexes};
});
