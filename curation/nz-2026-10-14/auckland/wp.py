import sys,json,urllib.request,urllib.parse,time,math
UA='IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'
def get(u):
    r=urllib.request.Request(u,headers={'User-Agent':UA})
    return json.load(urllib.request.urlopen(r,timeout=30))
def hav(a,b,c,d):
    R=6371;p=math.pi/180
    x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2
    return 2*R*math.asin(math.sqrt(x))
titles=[l.strip() for l in open('titles.txt') if l.strip()]
for i in range(0,len(titles),20):
    ch=titles[i:i+20]
    u='https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','prop':'coordinates|pageviews|pageimages','piprop':'name','pvipdays':60,'titles':'|'.join(ch),'redirects':1,'format':'json','colimit':50})
    d=get(u)
    for p in d['query']['pages'].values():
        c=p.get('coordinates',[{}])[0]
        pv=sum(v or 0 for v in p.get('pageviews',{}).values())/max(1,len(p.get('pageviews',{})))
        dist=hav(-36.8485,174.7633,c['lat'],c['lon']) if c else None
        print(f"{p['title']:45} {c.get('lat')} {c.get('lon')} dist={dist and round(dist,1)} pv/day={round(pv)} lead={p.get('pageimage')}")
    time.sleep(1)
