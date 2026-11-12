#!/usr/bin/env python3
"""Writes src/data/spotDistricts.json: each spot's second-level administrative division (NZ: the district or city council area,
e.g. "Selwyn District"; China: the prefecture-level city; elsewhere the county, municipality or equivalent), from OpenStreetMap's Nominatim reverse geocoder.

  python3 scripts/curation/build-spot-districts.py [--only id,id] [--refresh]

A standalone spot's carousel lists every spot in the same division. Existing entries are kept (the file is a cache; --refresh
redoes them). Nominatim allows about one request a second, so ~1000 spots take ~17 minutes; it writes as it goes and resumes.
"""
import json, os, re, subprocess, sys, time
args = sys.argv[1:]
OUT = 'src/data/spotDistricts.json'
cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
src = open('src/data/spots.ts').read()
dests = open('src/data/destinations.ts').read()
rows = []
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'): continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if m and c: rows.append((m.group(1), float(c.group(1)), float(c.group(2))))
standalone = set(re.findall(r"\{ id: ['\"]([^'\"]+)['\"],(?:(?!destinationId)[^\n])*country: 'New Zealand'", src))
def prio(r):
    # standalone spots first (their carousels need the divisions), then everything near them, then the rest
    return (0 if r[0] in standalone else 1 if -48 < r[1] < -34 and 165 < r[2] < 179 else 2)
todo = [r for r in rows if (only is None or r[0] in only) and ('--refresh' in args or r[0] not in cache)]
todo.sort(key=prio)
print(len(rows), 'spots,', len(todo), 'to look up;', sum(1 for r in todo if prio(r) == 0), 'standalone NZ first')
for i, (sid, lat, lon) in enumerate(todo):
    url = f'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}&zoom=10&addressdetails=1&accept-language=en'
    d = None
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', 'IntrepidApp-Curation/1.0', url], capture_output=True, text=True)
        try:
            d = json.loads(r.stdout); break
        except Exception:
            time.sleep(5)
    a = (d or {}).get('address', {})
    if a.get('country_code') == 'cn':
        # China: the second level is the prefecture-level city (地级市). The default zoom returns a district or county
        # (Xihu District, Gusu District), so ask at zoom 7, which returns the prefecture ("Hangzhou City", "Jinhua").
        time.sleep(1.1)
        u7 = url.replace('zoom=10', 'zoom=7')
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', 'IntrepidApp-Curation/1.0', u7], capture_output=True, text=True)
        try:
            a7 = json.loads(r.stdout).get('address', {})
            pref = a7.get('city') or a7.get('state_district') or a7.get('county')
            if pref:
                a = dict(a, county=re.sub(r' City$', '', pref))
        except Exception:
            pass
    name = a.get('county') or a.get('state_district') or a.get('municipality') or a.get('city') or a.get('town') or a.get('state')
    if name:
        cache[sid] = {'d': name, 'c': (a.get('country_code') or '').upper(), 'r': a.get('state', '')}
    else:
        print('no division for', sid, lat, lon)
    if i % 20 == 0:
        json.dump(cache, open(OUT, 'w'), indent=1, ensure_ascii=False); print(i, '/', len(todo), flush=True)
    time.sleep(1.1)
json.dump(cache, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('done', len(cache))
