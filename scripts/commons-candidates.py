#!/usr/bin/env python3
"""Commons candidate search + contact sheets for the image-searcher / image-judge roles (IMAGES.md). Run from a scratch dir; sheets go to ./sheets/.
usage: spot_cands.py spec.json tag  — spec: {name:[queries]}; prints candidates, writes sheets/sc-<tag>-<n>.jpg"""
import sys,json,re,io,urllib.request,urllib.parse
from PIL import Image, ImageDraw
UA={'User-Agent':'intrepid-photo-audit/1.0 (alexzhou38@gmail.com)'}
BAD=re.compile(r'\b(map|maps|satellite|locator|flag|coat of arms|logo|plan|diagram|drawing|illustration|sketch|painting|engraving|lithograph|poster|chart|aerial view|landsat|nasa|stamp|banknote|coin|svg)\b',re.I)
def api(p):
    return json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p),headers=UA),timeout=30))
def search(q,minw=1000,limit=25):
    d=api({'action':'query','generator':'search','gsrnamespace':6,'gsrsearch':q+' filetype:bitmap','gsrlimit':limit,'prop':'imageinfo','iiprop':'url|size|mime|extmetadata','iiurlwidth':420,'format':'json','formatversion':2})
    out=[]
    for p in d.get('query',{}).get('pages',[]):
        ii=(p.get('imageinfo') or [{}])[0]
        if not ii or ii.get('mime')!='image/jpeg' or ii.get('width',0)<minw: continue
        t=p['title'][5:]
        if BAD.search(t): continue
        md=ii.get('extmetadata',{}); date=re.sub('<[^>]+>','',md.get('DateTimeOriginal',{}).get('value',''))[:10]
        cats=re.sub('<[^>]+>','',md.get('Categories',{}).get('value',''))
        out.append(dict(title=t,w=ii['width'],h=ii['height'],thumb=ii.get('thumburl'),date=date,cats=cats,idx=p.get('index',0)))
    return sorted(out,key=lambda x:x['idx'])
spec=json.load(open(sys.argv[1])); tag=sys.argv[2]
CELL=270; COLS=6; ROWS=8
names=list(spec); allc={}
for n in names:
    seen=set(); c=[]
    for q in spec[n]:
        try: res=search(q)
        except Exception as e: res=[]
        for r in res:
            if r['title'] in seen: continue
            seen.add(r['title']); c.append(r)
    allc[n]=c[:COLS]
RH=CELL*3//4+30
for part in range(0,len(names),ROWS):
    chunk=names[part:part+ROWS]
    im=Image.new('RGB',(COLS*CELL,len(chunk)*RH),'white'); dr=ImageDraw.Draw(im)
    for r,n in enumerate(chunk):
        for i,c in enumerate(allc[n]):
            x=i*CELL;y=r*RH
            try:
                t=Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(c['thumb'],headers=UA),timeout=30).read())).convert('RGB'); t.thumbnail((CELL-4,CELL*3//4-2)); im.paste(t,(x+2,y+2))
            except Exception: dr.text((x+6,y+6),'fail',fill='red')
            dr.rectangle((x,y+CELL*3//4,x+CELL,y+RH),fill='#111')
            dr.text((x+4,y+CELL*3//4+2),f"{n[:16]} #{i} {c['w']}x{c['h']} {c['date']}",fill='#ff0'); dr.text((x+4,y+CELL*3//4+15),c['title'][:44],fill='white')
    im.save(f'sheets/sc-{tag}-{part//ROWS}.jpg',quality=80)
for n in names:
    for i,c in enumerate(allc[n]): print(f"{n} #{i} {c['w']}x{c['h']} {c['date']} {c['title']}")
