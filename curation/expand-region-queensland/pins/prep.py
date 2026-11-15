import json,re,time,urllib.parse,urllib.request,os
B='curation/expand-region-queensland/'
g=json.load(open(B+'global-keeps.json'))
cands={}
for r in set(x['region'] for x in g):
    for c in json.load(open(f'{B}region-qld-{r}/candidates.json')): cands[(r,c['name'])]=c
def inq(co): return co and -29.3<co['lat']<-9.5 and 137.9<co['lng']<154.2
def cat(n,note):
    t=(n+' '+note).lower()
    if re.search(r'\bbeach|bay\b|cove|spit\b',t) and not re.search(r'museum|park\b.*gallery',t): return 'beach'
    if re.search(r'museum|gallery|heritage village|centre',t): return 'museum'
    if re.search(r'lookout|summit|mount |peak|pinnacle|hill\b',t): return 'viewpoint'
    if re.search(r'walk|trail|track|circuit|great walk',t): return 'hike'
    if re.search(r'zoo|sanctuary|aquarium|park\b.*(adventure|world)|world|dreamworld|skypoint|farm|distillery|winery',t): return 'entertainment'
    if re.search(r'lighthouse|light\b|silo|big |statue|monument|memorial',t): return 'landmark'
    if re.search(r'homestead|historic|station|fort|house|mine',t): return 'historic'
    if re.search(r'market',t): return 'market'
    return 'nature'
spots=[];noco=[]
for i,x in enumerate(g):
    c=None
    for m in x['merged_from']:
        c=cands.get((m['region'],m['name']))
        if c: break
    wiki=(c or {}).get('wiki'); 
    co=(c or {}).get('coordinates')
    sid=f"qld-{i+1:03d}"
    spots.append({'id':sid,'name':x['name'],'wiki':wiki,'region':x['region'],'kind':x['kind'],'part_of':x.get('part_of'),'category':cat(x['name'],(c or {}).get('note','')),'coordinates':co if inq(co) else None,'hint_from':'candidate' if inq(co) else None,'note':x.get('note',''),'views':(c or {}).get('views',0)})
json.dump(spots,open(B+'pins/spots-input.raw.json','w'),indent=1)
print(len(spots),sum(1 for s in spots if s['coordinates']))
