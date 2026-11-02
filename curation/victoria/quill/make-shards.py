import json,os,glob
base='curation/victoria/quill'
d=json.load(open('curation/victoria/placement.combined.json'))
tiers=json.load(open(f'{base}/tiers.json'))
timed=[t['id'] for t in tiers['timed']]+[a if isinstance(a,str) else a['id'] for a in tiers.get('audit',[])]
timed=list(dict.fromkeys(timed))
by={s['id']:s for s in d['spots']}
have={os.path.splitext(f)[0] for f in os.listdir(f'{base}/evidence')}
sharded=set()
for f in glob.glob(f'{base}/shards/in-*.json'):
    sharded|={x['id'] for x in json.load(open(f))}
os.makedirs(f'{base}/shards',exist_ok=True)
todo=[i for i in timed if i in have and i not in sharded and i in by]
n=len(glob.glob(f'{base}/shards/in-*.json'))
new=[]
for k in range(0,len(todo)-len(todo)%6 if len(todo)>=6 else 0,6):
    chunk=todo[k:k+6]
    rows=[{'id':i,'name':by[i]['name'],'category':by[i].get('category'),'destination':by[i].get('destination'),'wiki':by[i].get('wiki'),'bio_draft':by[i].get('bio_draft'),'coordinates':by[i].get('coordinates'),'needs_research':by[i].get('needs_research'),'evidence':f'{base}/evidence/{i}.json'} for i in chunk]
    json.dump(rows,open(f'{base}/shards/in-{n}.json','w'),indent=1); new.append(n); n+=1
print('timed',len(timed),'with evidence',len([i for i in timed if i in have]),'new shards',new)
