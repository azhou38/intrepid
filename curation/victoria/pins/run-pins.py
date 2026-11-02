import json,subprocess,sys,os
shard,n=int(sys.argv[1]),int(sys.argv[2])
d=json.load(open('curation/victoria/placement.combined.json'))
dc={x['id']:x['coordinates'] for x in d['new_destinations']}
def ll(c):
    if not c: return None
    return c.get('latitude',c.get('lat')),c.get('longitude',c.get('lng'))
todo=[s for s in d['spots'] if 'resolve-pin' not in (s.get('coordinates_source') or '')]
todo=[s for i,s in enumerate(todo) if i%n==shard]
out=f'curation/victoria/pins/shard-{shard}.jsonl'
done=set()
if os.path.exists(out): done={json.loads(l)['key'] for l in open(out)}
for s in todo:
    key=f"{s['_region']}|{s['name']}"
    if key in done: continue
    h=ll(s.get('coordinates')) or ll(dc.get(s.get('destination'))) 
    if not h: 
        open(out,'a').write(json.dumps({'key':key,'error':'no hint'})+'\n'); continue
    cmd=['python3','scripts/curation/resolve-pin.py','--name',s['name'],'--category',s.get('category') or 'landmark','--lat',str(h[0]),'--lon',str(h[1]),'--json']
    if s.get('wiki'): cmd+=['--wiki',s['wiki']]
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=180)
        res=json.loads(r.stdout) if r.stdout.strip().startswith('{') else {'error':r.stdout[-200:]+r.stderr[-200:]}
    except Exception as e: res={'error':str(e)}
    res['key']=key; res['hint']=h; res['had_coords']=bool(s.get('coordinates'))
    open(out,'a').write(json.dumps(res)+'\n')
