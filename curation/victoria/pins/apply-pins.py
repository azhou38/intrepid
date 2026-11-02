import json,glob,sys,re
dec=lambda v: len(str(v).split('.')[1]) if '.' in str(v) else 0
files=sys.argv[1:]
pins={}
for f in files:
    for r in json.load(open(f)):
        if r.get('confidence') in('HIGH','MEDIUM') and r.get('lat') is not None and dec(r['lat'])>=5 and dec(r['lon'])>=5:
            pins[r['id']]=r
print(len(pins),'usable pins')
n=0
for g in glob.glob('curation/victoria/region-*/apply-placement.json'):
    d=json.load(open(g)); ch=False
    for e in d['placements']:
        if e['id'] in pins:
            p=pins[e['id']]; e['coordinates']={'latitude':p['lat'],'longitude':p['lon']}; ch=True; n+=1
    if ch: json.dump(d,open(g,'w'),indent=1,ensure_ascii=False)
for g in glob.glob('curation/victoria/quill/vic-*/final.json'):
    d=json.load(open(g)); ch=False
    for sid,q in d['spots'].items():
        if sid in pins: q['coordinates']={'latitude':pins[sid]['lat'],'longitude':pins[sid]['lon']}; ch=True
    if ch: json.dump(d,open(g,'w'),indent=1,ensure_ascii=False)
print(n,'placements updated')
json.dump(pins,open('curation/victoria/pins/_last_applied.json','w'),indent=1)
