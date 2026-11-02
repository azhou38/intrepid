import json,glob,os,re,collections
B='curation/victoria'; Q=f'{B}/quill'
def norm(c):
    if isinstance(c,dict) and 'lat' in c: return {'latitude':c['lat'],'longitude':c.get('lng',c.get('lon'))}
    return c
def L(p):
    d=json.load(open(p)); return d
research={}
for f in glob.glob(f'{Q}/shards/research-*.json'):
    d=L(f); d=d if isinstance(d,list) else d.get('spots') or d.get('research') or []
    for x in d: research[x['id']]=x
bios={}
for f in glob.glob(f'{Q}/bios/out-*.json'):
    d=L(f); d=d if isinstance(d,list) else d.get('bios',[])
    for x in d: bios[x['id']]=x
tiers=L(f'{Q}/tiers.json'); simple={x['id']:x['facts'] for x in tiers['simple']}
ICON={'museum':'🏛️','landmark':'📍','monument':'🗿','religious':'⛪','nature':'🌿','viewpoint':'👀','hike':'🥾','entertainment':'🎡','market':'🛍️','beach':'🏖️','historic':'🏛️'}
RENAME_ID={'mitchell-river-national-park':'mitchell-river-national-park-vic'}
HELD={ # id: reason
 'grampians-national-park-16':'Billimina Rock Art Site is reported closed to visitors after bushfire track damage',
 'yarra-valley-10':'Yarra Valley Railway passenger services are paused until further notice',
 'melbourne-44':'Crown Entertainment Complex is a casino and shopping venue: fails the qualifies test',
 'traralgon':'no visitor-oriented source names a draw',
 'yarra-valley-15':'Lilydale: only Wikipedia names it, no visitor source',
 'ballarat-3':'Eureka Stockade is the same park as the Eureka Centre (ballarat-2): near-duplicate',
}
fin_by_region={}; stats=collections.Counter(); problems=[]
for pf in sorted(glob.glob(f'{B}/region-*/placement.json')):
    reg=pf.split('region-')[1].split('/')[0]; d=L(pf)
    entries=[]
    for k in ('spots','places','standalone_spots'):
        for s in d.get(k) or []: entries.append(s)
    final={'spots':{},'existing_fixes':{},'held':[]}; placements=[]
    for s in entries:
        sid=s['id']; r=research.get(sid); b=bios.get(sid)
        osid=sid
        if sid in HELD: final['held'].append({'id':sid,'reason':HELD[sid]}); continue
        if not r and sid in simple and b:
            f0=simple[sid]; r={'free':True,'costBasis':'open','visitHoursMin':f0.get('visitHoursMin',0.25),'visitHoursMax':f0.get('visitHoursMax',1)}
        if not r or not b: problems.append((sid,'missing research/bio')); continue
        if b.get('drop_reason'): final['held'].append({'id':sid,'reason':b['drop_reason']}); continue
        name=b.get('name_fix') or s['name']
        q={'name':name,'icon':s.get('icon') or ICON.get(s.get('category'),'📍'),'category':s.get('category'),'bio':b['bio'],
           'coordinates':norm(s.get('coordinates'))}
        w=r.get('wiki')
        if w and w!=name: q['wiki']=w
        q['visitHoursMin']=r.get('visitHoursMin',s.get('visitHoursMin')); q['visitHoursMax']=r.get('visitHoursMax',s.get('visitHoursMax'))
        if r.get('free') is True: q['free']=True
        else:
            if r.get('costMin') is not None: q['costMin']=r['costMin']; q['costMax']=r.get('costMax',r['costMin']); q['currency']=r.get('currency') or 'AUD'
        cb=r.get('costBasis')
        if cb=='park' and r.get('free'): cb='open'
        if cb: q['costBasis']=cb
        for k in ('costPer','needs'):
            if r.get(k): q[k]=r[k]
        if r.get('ticketUrl'): q['ticketUrl']=r['ticketUrl']
        if q.get('visitHoursMin') is None or q.get('visitHoursMax') is None:
            q['visitHoursMin'],q['visitHoursMax']=0.5,1.5; problems.append((sid,'visit hours defaulted 0.5-1.5'))
        if not (q.get('free') or q.get('costMin') is not None): problems.append((sid,'no cost')); 
        final['spots'][sid]=q
        placements.append({'id':sid,'name':name,'action':s['action'] if s['action'] in('spot','standalone') else 'standalone','destination':s.get('destination') if s['action']=='spot' else None,'coordinates':norm(s.get('coordinates')),'photo':None,'photo_verdict':'none'})
        stats['spots']+=1
    os.makedirs(f'{Q}/{reg}',exist_ok=True)
    json.dump(final,open(f'{Q}/{reg}/final.json','w'),indent=1,ensure_ascii=False)
    json.dump({'placements':placements},open(f'{B}/region-{reg}/apply-placement.json','w'),indent=1,ensure_ascii=False)
    print(reg,len(placements),'ready,',len(final['held']),'held')
# destinations
dests={x['id']:x for x in L(f'{B}/placement.combined.json')['new_destinations']}
os.makedirs(f'{Q}/dest-final',exist_ok=True)
for f in glob.glob(f'{Q}/dest/wr-out-*.json'):
    d=L(f); d=d if isinstance(d,list) else d['destinations']
    for w in d:
        p=dests[w['id']]
        dd={'id':p['id'],'name':p['name'],'country':p.get('country','Australia'),'countryCode':p.get('countryCode','AU'),'timezone':p.get('timezone','Australia/Melbourne'),'continent':p.get('continent','Oceania'),'coordinates':norm(p['coordinates']),'category':p['category'],'defaultZoomSpanKm':p['defaultZoomSpanKm'],'rank':p['rank'],'icon':w['icon'],'tagline':w['tagline'],'description':w['description'],'whyVisit':w['whyVisit'],'highlights':w['highlights'],'goodToKnow':w['goodToKnow'],'bestMonths':w['bestMonths'],'bestTimeBlurb':w['bestTimeBlurb']}
        json.dump({'destination':dd,'spots':{},'notes':w.get('notes'),'unverified':w.get('unverified')},open(f'{Q}/dest-final/{p["id"]}.final.json','w'),indent=1,ensure_ascii=False)
print(len(glob.glob(f'{Q}/dest-final/*.json')),'destination finals')
print(stats,len(problems)); 
for p in problems[:40]: print(p)
