import json,glob,os,re
B='curation/expand-region-queensland/'
pl=json.load(open(B+'placement.pinned.json'))
spots={s['id']:s for s in pl['spots']}
out={};dup=[];held=[];missing=[]
for f in sorted(glob.glob(B+'quill/shard-*/final.json')):
    d=json.load(open(f)); sh=f.split('/')[-2]
    items={}
    if 'spots' in d and isinstance(d['spots'],list):
        for r in d['spots']: items[r['id']]=r
    elif 'spots' in d and isinstance(d['spots'],dict): items=d['spots']
    else:
        items={k:v for k,v in d.items() if not k.startswith('_') and k!='shard' and isinstance(v,dict)}
    for sid,r in items.items():
        r=dict(r); r['_shard']=sh
        if r.get('duplicate_of'):
            dup.append((sid,r['duplicate_of']))
            if sid in ('moreton-island-5',) or str(r['duplicate_of']).split(' ')[0]==sid: continue
        if not r.get('bio'): held.append((sid,r.get('held') or 'no bio')); 
        if sid in out and out[sid].get('bio'): continue  # first real wins
        out[sid]=r
# simple tier bios (28 written) join as simple records with default free/open costs
for f in sorted(glob.glob(B+'quill/simple/simple-bios-*.json')):
    for r in json.load(open(f)):
        if r.get('bio') and r['id'] not in out:
            out[r['id']]={'bio':r['bio'],'visitHoursMin':r.get('visitHoursMin'),'visitHoursMax':r.get('visitHoursMax'),'hours_estimate':True,'cost':{'free':True,'costBasis':'open','needs':None,'note':'default: no source states a fee'},'_shard':'simple'}
res={}
for sid,r in out.items():
    p=spots.get(sid)
    if not p: missing.append(sid); continue
    m=dict(p); m.update({k:v for k,v in r.items() if k not in('id',)}); res[sid]=m
json.dump(res,open(B+'final-spots.json','w'),indent=1)
json.dump(json.load(open(B+'quill-dest/final-dest.json')),open(B+'final-dest.json','w'),indent=1)
print(len(res),'spots; dup',dup,'; held',held,'; not in placement',missing)
# spots with no final at all
nofinal=[s for s in spots if s not in res and not any(d[0]==s for d in dup)]
print('no final:',len(nofinal),nofinal[:40])
