#!/usr/bin/env python3
"""Finds a spot's pin from real map features, never from memory (COVERAGE.md → "Verifying coordinates").

  python3 scripts/curation/resolve-pin.py --name "Paritutu Rock" --category viewpoint --lat -39.06 --lon 174.04 [--wiki "Paritutu Rock"] [--json]

--lat/--lon is only a hint (a town or a rough pin): candidates are searched within 8 km of it. Candidates, each with its source
and OSM feature type:
  osm      OpenStreetMap features whose name shares a word with the spot, of the type the category implies (peak/viewpoint for a
           hill or lookout, beach for a beach, waterfall, trailhead or car park for a walk, the building for a museum, ...)
  photon   the Photon geocoder biased to the hint (fallback when Overpass is down)
  wiki     the spot's English Wikipedia coordinates (often rounded to the town: a reference, not a pin)
  commons  geotagged Commons files near the hint whose title shares a word with the spot
Prints the recommended point and a confidence: HIGH when two independent sources agree within 100 m, MEDIUM for one precise OSM
feature, LOW otherwise (then do not guess: leave the spot unpinned for the owner, or pin the agency's trailhead and say so).
A recommended point has at least 5 decimal places; a spot written with round coordinates (-39.0640, 174.0400) is a memory pin.
"""
import json, math, re, subprocess, sys, time, urllib.parse

a = sys.argv[1:]
opt = lambda f, d=None: a[a.index(f) + 1] if f in a else d
name, cat, wiki = opt('--name'), opt('--category', ''), opt('--wiki')
if not name or opt('--lat') is None:
    sys.exit(__doc__)
lat0, lon0 = float(opt('--lat')), float(opt('--lon'))
UA = 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'
TYPES = {   # category -> Overpass selectors that name the thing itself
    'viewpoint': ['natural=peak', 'tourism=viewpoint', 'natural=cliff', 'natural=rock'],
    'hike': ['highway=trailhead', 'natural=peak', 'tourism=viewpoint', 'information=route_marker', 'amenity=parking'],
    'beach': ['natural=beach', 'natural=bay'],
    'nature': ['natural=peak', 'natural=beach', 'waterway=waterfall', 'natural=water', 'tourism=viewpoint', 'natural=bay', 'leisure=nature_reserve', 'boundary=protected_area'],
    'museum': ['tourism=museum', 'tourism=gallery', 'tourism=attraction'],
    'landmark': ['tourism=attraction', 'historic=*', 'man_made=lighthouse', 'natural=peak', 'natural=rock'],
    'historic': ['historic=*', 'tourism=attraction', 'tourism=museum'],
    'entertainment': ['tourism=attraction', 'leisure=*', 'amenity=spa'],
    'market': ['amenity=marketplace', 'shop=*'],
    'monument': ['historic=monument', 'historic=memorial', 'tourism=attraction'],
    'religious': ['amenity=place_of_worship'],
}
GENERIC = {'the', 'and', 'of', 'track', 'walk', 'trail', 'reserve', 'park', 'national', 'scenic', 'walkway', 'rock', 'rocks', 'hill', 'hills',
           'mount', 'peak', 'point', 'head', 'bay', 'beach', 'falls', 'lake', 'lakes', 'tarns', 'tarn', 'river', 'island', 'lookout', 'summit',
           'museum', 'gardens', 'garden', 'valley', 'forest', 'conservation', 'area', 'historic', 'heritage', 'centre', 'center', 'caves', 'cave'}
allw = {w.lower() for w in re.findall(r"[A-Za-zĀ-ſ']{3,}", name)}
words = (allw - GENERIC) or allw   # a distinctive word must match ('Paritutu'), so 'Fishing Rock' cannot stand in for 'Paritutu Rock'


def get(url, data=None):
    # curl, not urllib: the system Python's TLS fails the handshake with Overpass.
    for i in range(3):
        cmd = ['curl', '-s', '-m', '60', '-A', UA, url] + (['--data', data.decode()] if data else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        try:
            return json.loads(r.stdout)
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def dist(la, lo, lb, lc):
    return math.hypot((la - lb) * 111320, (lo - lc) * 111320 * math.cos(math.radians(la)))


cands = []
sels = TYPES.get(cat, TYPES['nature'])
ALL = sorted({x for v in TYPES.values() for x in v})


def search(selectors):
    body = ''
    for sel in selectors:
        k, v = sel.split('=')
        body += f'nwr["{k}"](around:8000,{lat0},{lon0});' if v == '*' else f'nwr["{k}"="{v}"](around:8000,{lat0},{lon0});'
    q = f'[out:json][timeout:30];({body});out center tags 300;'
    o = get('https://overpass-api.de/api/interpreter', ('data=' + urllib.parse.quote(q)).encode())
    found = []
    for e in (o or {}).get('elements', []):
        t = e.get('tags', {}); n = (t.get('name') or t.get('name:en') or '').lower()
        hit = [w for w in words if w in n]
        if not hit: continue
        la, lo = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
        kind = next((f'{k}={t[k]}' for k in ('natural', 'tourism', 'waterway', 'historic', 'highway', 'amenity', 'leisure', 'man_made') if k in t), 'feature')
        found.append({'src': 'osm', 'name': t.get('name'), 'type': kind, 'lat': la, 'lon': lo, 'match': len(hit) / max(1, len(words))})
    return o, found


o, found = search(sels)
if o is not None and not found:
    o, found = search(ALL)   # the category may not name the feature type (Pouakai Tarns are natural=water, not a viewpoint)
cands += found
if o is None:
    p = get('https://photon.komoot.io/api/?limit=8&lat=%s&lon=%s&q=%s' % (lat0, lon0, urllib.parse.quote(name)))
    for f in (p or {}).get('features', []):
        pr = f['properties']; lo, la = f['geometry']['coordinates']
        if dist(lat0, lon0, la, lo) < 8000 and words & {w.lower() for w in re.findall(r"\w{3,}", pr.get('name', ''))}:
            cands.append({'src': 'photon', 'name': pr.get('name'), 'type': f"{pr.get('osm_key')}={pr.get('osm_value')}", 'lat': la, 'lon': lo, 'match': 0.6})
if wiki or name:
    w = get('https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&format=json&titles=' + urllib.parse.quote(wiki or name))
    for pg in ((w or {}).get('query', {}).get('pages', {})).values():
        for c in pg.get('coordinates', []):
            cands.append({'src': 'wiki', 'name': pg['title'], 'type': 'article', 'lat': c['lat'], 'lon': c['lon'], 'match': 1.0})
g = get(f'https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord={lat0}|{lon0}&gsradius=8000&gslimit=100&gsnamespace=6&format=json')
files = [x for x in (g or {}).get('query', {}).get('geosearch', []) if words & {w.lower() for w in re.findall(r"\w{3,}", x['title'])}]
if files:
    la = sorted(x['lat'] for x in files)[len(files) // 2]; lo = sorted(x['lon'] for x in files)[len(files) // 2]
    cands.append({'src': 'commons', 'name': f'{len(files)} geotagged files', 'type': 'photo median', 'lat': la, 'lon': lo, 'match': 0.5})
for c in cands:
    c['from_hint_m'] = round(dist(lat0, lon0, c['lat'], c['lon']))
cands.sort(key=lambda c: (c['src'] != 'osm', -c['match'], c['from_hint_m']))
best = next((c for c in cands if c['src'] in ('osm', 'photon')), None) or next((c for c in cands if c['src'] == 'commons'), None)   # photo median: approximate, LOW
agree = [c for c in cands if best and c is not best and dist(best['lat'], best['lon'], c['lat'], c['lon']) <= 100]
conf = 'LOW'
if best:
    conf = 'HIGH' if agree and best['src'] != 'commons' else ('MEDIUM' if best['src'] == 'osm' else 'LOW')
res = {'name': name, 'recommended': {k: (round(best[k], 6) if k in ('lat', 'lon') else best[k]) for k in ('lat', 'lon', 'src', 'name', 'type')} if best else None,
       'confidence': conf, 'agreeing': [c['src'] for c in agree], 'candidates': cands[:10]}
if '--json' in a:
    print(json.dumps(res, ensure_ascii=False, indent=1))
else:
    print(f'{name} ({cat}): hint {lat0},{lon0}')
    for c in cands[:10]:
        print(f"  {c['src']:7} {c['type']:22} {c['lat']:.6f},{c['lon']:.6f}  {c['from_hint_m']:>5} m from hint  {c['name']}")
    print(f"=> {conf}" + (f": {res['recommended']['lat']},{res['recommended']['lon']} ({best['src']} {best['type']} \"{best['name']}\")" if best else ': no feature found; do not guess'))
