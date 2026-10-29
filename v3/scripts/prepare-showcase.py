"""Create a reproducible, spatially spaced showcase from unchanged CSV exports."""
import csv,json,math,sys,random
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT.parent/'v2/data/exports'
def read(name):
 with (SOURCE/(name+'.csv')).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def distance(a,b):
 lat1,lon1=float(a['latitude']),float(a['longitude']);lat2,lon2=float(b['latitude']),float(b['longitude'])
 return 6371000*2*math.asin(min(1,math.sqrt(math.sin(math.radians(lat2-lat1)/2)**2+math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(math.radians(lon2-lon1)/2)**2)))
def stamp(s):return s.replace('.000Z','Z')
def number(s):return int(s) if s else None
raw=read('bike_stations');hist=read('availability_history');accidents=read('collisions');reports=read('fault_reports')
counts=Counter(h['station_id'] for h in hist)
candidates=[s for s in raw if 51.48<=float(s['latitude'])<=51.55 and -.20<=float(s['longitude'])<=.01 and counts[s['station_id']]]
# Names are matched against the actual export, not invented stations or inferred footfall.
important_names=["Waterloo Station 1", "Waterloo Station 2", "Waterloo Station 3", "Pancras Road", "St. Chad's Street", "Argyle Street", "Euston Road", "Euston Square Gardens", "Warren Street Station", "Gower Place", "London Street, Paddington", "South Wharf Road", "North Wharf Road", "Brushfield Street", "Finsbury Circus", "Devonshire Square", "Tachbrook Street", "Eccleston Place", "Elizabeth Bridge", "Duke Street Hill", "Snowsfields", "Westminster Pier", "Abingdon Green", "Storey's Gate", "British Museum", "Natural History Museum", "Victoria & Albert Museum", "South Kensington Station", "Hyde Park Corner", "Wellington Arch", "Serpentine Car Park", "Tower Gardens", "St. Katharine's Way", "Bank of England Museum", "Queen Street 1, Bank", "Tate Modern", "Jubilee Plaza", "Heron Quays DLR", "Upper Bank Street", "Westferry Circus"]
chosen=[]; reasons={}
for key in important_names:
 for station in candidates:
  if key.lower() in station['station_name'].lower() and station not in chosen:
   chosen.append(station); reasons[station['station_id']]='Transport hub or landmark area: '+key
for station in candidates:
 if counts[station['station_id']]>1 and station not in chosen:
  chosen.append(station);reasons[station['station_id']]='Multiple original observations'
# Reproducible sampling preserves naturally dense streets instead of evenly spreading points.
remaining=[station for station in candidates if station not in chosen]
random.Random(20261028).shuffle(remaining)
for station in remaining[:max(0,400-len(chosen))]:
 chosen.append(station);reasons[station['station_id']]='Original geographic distribution sample'
ids={s['station_id'] for s in chosen};latest=max(h['captured_at'] for h in hist if h['station_id'] in ids)
stations=[]
for s in chosen:
 observations=[]
 for h in hist:
  if h['station_id']!=s['station_id']:continue
  observations.append({'recordedAt':stamp(h['captured_at']),'bikes':number(h['bikes']),'docks':number(h['empty_docks']),'capacity':number(h['total_docks']),'isOperational':None if h['is_locked']=='' else h['is_locked']=='0','faults':None})
 observations.sort(key=lambda h:h['recordedAt'])
 stations.append({'id':s['station_id'],'name':s['station_name'],'lat':float(s['latitude']),'lon':float(s['longitude']),'area':None,'history':observations})
# Retain every original collision within the station coverage rectangle.
# The map layer starts hidden and uses canvas so record count does not create DOM overload.
lat_min=min(float(s['latitude']) for s in chosen);lat_max=max(float(s['latitude']) for s in chosen)
lon_min=min(float(s['longitude']) for s in chosen);lon_max=max(float(s['longitude']) for s in chosen)
collision_sample=[c for c in accidents if lat_min<=float(c['latitude'])<=lat_max and lon_min<=float(c['longitude'])<=lon_max]
collisions=[{'id':c['collision_id'],'title':c['severity']+' cycle collision','lat':float(c['latitude']),'lon':float(c['longitude']),'date':c['collision_date'][:10],'note':'Original export record. Casualties: '+c['casualty_count'],'source':'Original CSV export; all collisions within selected station bounds'} for c in collision_sample]
meta={'schemaVersion':2,'source':f'Original CSV: {len(stations)} stations; {len(collisions)} regional 2025 collisions · not live','timezone':'UTC','selection':{'stationLimit':400,'importantStationIds':[station['station_id'] for station in chosen if reasons[station['station_id']].startswith('Transport')],'reasons':reasons,'bounds':[lat_min,lon_min,lat_max,lon_max],'originalStations':len(raw),'originalCollisions':len(accidents)}}
dataset={'meta':meta,'stations':stations,'collisions':collisions}
(ROOT/'data/showcase.json').write_text(json.dumps(dataset,ensure_ascii=False,indent=2)+'\n')
summary={'source':str(SOURCE),'original':{'stations':len(raw),'history':len(hist),'collisions':len(accidents),'reports':len(reports)},'selected':{'stations':len(stations),'history':sum(len(s['history']) for s in stations),'collisions':len(collisions)},'timestamps':sorted({h['recordedAt'] for s in stations for h in s['history']}),'availabilityAtLatest':dict(Counter('unknown' if not s['history'] else 'unavailable' if s['history'][-1]['bikes']==0 else 'limited' if s['history'][-1]['bikes']<=5 else 'good' for s in stations)),'limitations':['Only two real observation times; no interpolated or invented history.','Fault reports are not observation-time counts and are not mapped to faults.','All original collisions within the selected station bounds are retained; outside records remain in exports.','2025 collision dates and 2026 availability dates represent different periods.']}
(ROOT/'data/selection-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
