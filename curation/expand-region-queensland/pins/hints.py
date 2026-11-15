import json,time,urllib.parse,urllib.request
B='curation/expand-region-queensland/pins/'
S=json.load(open(B+'spots-input.raw.json'))
RC={'brisbane':(-27.47,153.03),'gold-coast':(-28.0,153.4),'sunshine-coast':(-26.65,153.0),'fraser-bundaberg':(-25.3,152.8),'capricorn':(-23.4,150.8),'mackay-whitsundays':(-20.9,148.7),'townsville':(-19.3,146.8),'cairns-tablelands':(-17.3,145.7),'daintree-cape-york':(-15.5,145.2),'darling-downs':(-27.8,151.5),'central-highlands':(-25.0,149.0),'outback-gulf':(-23.0,142.5)}
def inq(la,lo): return -29.3<la<-9.5 and 137.9<lo<154.2
for s in S:
    if s['coordinates']: continue
    la,lo=RC[s['region']]
    q=urllib.parse.urlencode({'q':s['name']+', Queensland, Australia','format':'json','limit':3,'countrycodes':'au','viewbox':'137.9,-9.5,154.2,-29.3','bounded':1})
    try:
        req=urllib.request.Request('https://nominatim.openstreetmap.org/search?'+q,headers={'User-Agent':'IntrepidApp-Curation/1.0'})
        r=json.load(urllib.request.urlopen(req,timeout=30))
        best=None
        for x in r:
            a,b=float(x['lat']),float(x['lon'])
            if inq(a,b): best=(a,b); break
        if best: s['coordinates']={'lat':best[0],'lng':best[1]}; s['hint_from']='nominatim'
    except Exception as e: s['hint_err']=str(e)[:80]
    time.sleep(1.1)
json.dump(S,open(B+'spots-input.json','w'),indent=1)
print(sum(1 for s in S if s['coordinates']),len(S))
