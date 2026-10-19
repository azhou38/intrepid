#!/usr/bin/env python3
"""Writes src/data/spotDistricts.json entries for Australian spots in NSW from the NSW Spatial Services local government
area layer (Nominatim only returns "New South Wales" for rural points, which would put every NSW spot in one carousel).

  python3 scripts/curation/build-nsw-districts.py [--only id,id] [--refresh]

Spots whose entry is missing, or is just the state, are looked up; Sydney's existing entries are kept unless --refresh.
"""
import json, re, sys, time, urllib.request
args = sys.argv[1:]
only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
OUT = 'src/data/spotDistricts.json'
cache = json.load(open(OUT))
src = open('src/data/spots.ts').read()
URL = 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Administrative_Boundaries_Theme/MapServer/8/query?geometry={lon},{lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=lganame&returnGeometry=false&f=json'
rows = []
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:') or 'countryCode: "AU"' not in l and "countryCode: 'AU'" not in l:
        continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if m and c:
        rows.append((m.group(1), float(c.group(1)), float(c.group(2))))
n = 0
for sid, lat, lon in rows:
    cur = cache.get(sid)
    if only and sid not in only:
        continue
    if cur and cur['d'] != 'New South Wales' and '--refresh' not in args:
        continue
    for _ in range(4):
        try:
            d = json.load(urllib.request.urlopen(URL.format(lat=lat, lon=lon), timeout=30)); break
        except Exception:
            d = None; time.sleep(3)
    f = (d or {}).get('features') or []
    for dl, dn in [(0.004, 0), (-0.004, 0), (0, 0.004), (0, -0.004), (0.01, 0.01), (-0.01, -0.01), (0.01, -0.01), (-0.01, 0.01)]:
        if f:
            break   # a beach pin can sit just outside the polygon on the water: try nearby points
        try:
            f = json.load(urllib.request.urlopen(URL.format(lat=lat + dl, lon=lon + dn), timeout=30)).get('features') or []
        except Exception:
            f = []
    if not f:
        print('no LGA for', sid, lat, lon); continue
    name = f[0]['attributes']['lganame'].replace('UNINCORPORATED - ', '').title()
    cache[sid] = {'d': name, 'c': 'AU', 'r': 'New South Wales'}
    n += 1
    time.sleep(0.2)
json.dump(cache, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('set', n, 'of', len(rows), 'AU spots')
