#!/usr/bin/env python3
"""Non-Commons, freely licensed photo search (Openverse) for IMAGES.md "When Commons has no suitable photo". Sheets go to ./ov/ (create it).
usage: ov.py spec.json tag — spec {name:[queries]}; Openverse (non-Wikimedia, CC0/PDM/BY/BY-SA), >=1280px; writes ov/<tag>-<name>.jpg sheets and ov/<tag>.json"""
import sys,json,io,re,urllib.request,urllib.parse
from PIL import Image,ImageDraw
UA={'User-Agent':'IntrepidApp-Photos/1.0 (alexzhou38@gmail.com)'}
def get(u,t=40): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
MINW=int(sys.argv[3]) if len(sys.argv)>3 else 1280
spec=json.load(open(sys.argv[1]));tag=sys.argv[2];allr={}
for name,qs in spec.items():
    seen={};res=[]
    for q in qs:
        u='https://api.openverse.org/v1/images/?'+urllib.parse.urlencode({'q':q,'license':'cc0,pdm,by,by-sa','page_size':20,'mature':'false'})
        try: d=json.loads(get(u))
        except Exception as e: print('ERR',q,str(e)[:50]); continue
        for r in d.get('results',[]):
            if r['source'] in('wikimedia','wikimedia_commons') or r['id'] in seen: continue
            if (r.get('width') or 0)<MINW: continue
            seen[r['id']]=1; res.append(r)
    res=res[:18]; allr[name]=[{k:r.get(k) for k in('id','title','url','width','height','creator','license','license_version','foreign_landing_url','source','thumbnail')} for r in res]
    COLS=6;CELL=250;rows=max(1,(len(res)+COLS-1)//COLS)
    im=Image.new('RGB',(COLS*CELL,rows*(CELL*3//4+36)),'white');dr=ImageDraw.Draw(im)
    for i,r in enumerate(res):
        try:
            t=Image.open(io.BytesIO(get(r['thumbnail']))).convert('RGB');t.thumbnail((CELL-4,CELL*3//4))
            rr,cc=divmod(i,COLS);im.paste(t,(cc*CELL,rr*(CELL*3//4+36)));dr.text((cc*CELL+2,rr*(CELL*3//4+36)+CELL*3//4+2),f"{i} {(r['title'] or '')[:38]}",fill='black');dr.text((cc*CELL+2,rr*(CELL*3//4+36)+CELL*3//4+14),f"{r['source']} {r['license']} {r['width']}px",fill='gray')
        except Exception as e: pass
    im.save(f'ov/{tag}-{re.sub(r"[^a-z0-9]+","_",name.lower())}.jpg',quality=80);print(name,len(res))
json.dump(allr,open(f'ov/{tag}.json','w'),indent=1)
