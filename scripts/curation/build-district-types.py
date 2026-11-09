#!/usr/bin/env python3
"""Writes src/data/districtTypes.json: what kind of place each division in spotDistricts.json is ("City", "District", "County",
"Shire", ...), so a carousel titled "Jurong" can read "Jurong (City)". One lookup per distinct division (country + name), not per spot:
Nominatim reverse-geocodes one of its spots (with extratags, for the Wikidata id), then Wikidata's "instance of" gives the type.

  python3 scripts/curation/build-district-types.py [--refresh]

Key is "<country code>|<division name>" (the same key MapScreen's districtKey uses). Resumable; the file is a cache."""
import json, os, re, subprocess, sys, time
OUT = 'src/data/districtTypes.json'
cache = json.load(open(OUT)) if os.path.exists(OUT) and '--refresh' not in sys.argv else {}
dist = json.load(open('src/data/spotDistricts.json'))
src = open('src/data/spots.ts').read()
pos = {}
for l in src.split('\n'):
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if m and c: pos[m.group(1)] = (float(c.group(1)), float(c.group(2)))
rep = {}
for sid, v in dist.items():
    if sid in pos: rep.setdefault(f"{v['c']}|{v['d']}", sid)

def curl(url):
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', 'IntrepidApp-Curation/1.0', url], capture_output=True, text=True)
        try: return json.loads(r.stdout)
        except Exception: time.sleep(5)

# Wikidata "instance of" label -> short label shown in the app, first match wins
RULES = [('city', 'City'), ('district', 'District'), ('county', 'County'), ('shire', 'Shire'), ('municipalit', 'Municipality'),
         ('commune', 'Municipality'), ('borough', 'Borough'), ('local government', 'Council area'), ('council', 'Council area'),
         ('province', 'Province'), ('prefecture', 'Prefecture'), ('state', 'State'), ('region', 'Region'), ('parish', 'Parish'),
         ('town', 'Town'), ('island', 'Island'), ('canton', 'Canton'), ('department', 'Department'), ('ward', 'Ward'), ('board', 'Local board')]
ADDR = {'county': 'County', 'city': 'City', 'municipality': 'Municipality', 'state_district': 'District', 'town': 'Town', 'state': 'State', 'province': 'Province', 'region': 'Region'}
def short(labels):
    for lab in labels:
        for k, v in RULES:
            if k in lab.lower(): return v
todo = [k for k in rep if k not in cache]
print(len(rep), 'divisions,', len(todo), 'to look up')
# Phase 1: Nominatim reverse-geocodes one spot of each division at several zoom levels and keeps the feature whose NAME is the
# division's (a point's default feature can be the city inside a county, which would give the county the city's type).
def squash(x): return re.sub(r'[^a-z0-9]+', '', (x or '').lower())
info = {}
for i, key in enumerate(todo):
    lat, lon = pos[rep[key]]
    cc, name = key.split('|', 1)
    found = None
    for zoom in ([7, 6, 8, 10] if cc == 'CN' else [10, 8, 9, 6, 12, 5]):
        d = curl(f'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}&zoom={zoom}&addressdetails=0&extratags=1&namedetails=1&accept-language=en') or {}
        names = {squash(d.get('name')), *[squash(v) for v in (d.get('namedetails') or {}).values()]}
        time.sleep(1.1)
        if squash(name) in names or any(squash(name) and (squash(name) in n or n in squash(name)) and len(n) > 3 for n in names):
            found = {'q': (d.get('extratags') or {}).get('wikidata'), 'addr': d.get('addresstype'), 'zoom': zoom}; break
    info[key] = found or {'q': None, 'addr': None, 'zoom': None}
    if i % 50 == 0: print('nominatim', i, '/', len(todo), flush=True)
# Phase 2: Wikidata in batches of 40 ids (claims), then the labels of every "instance of" value, 40 at a time.
def batches(xs, n=40):
    for j in range(0, len(xs), n): yield xs[j:j + n]
def wd(ids, props):
    for _ in range(6):
        d = curl('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&' + props + '&ids=' + '|'.join(ids))
        if d and 'entities' in d: return d['entities']
        time.sleep(15)
    return {}
qids = sorted({v['q'] for v in info.values() if v['q']})
p31 = {}
for b in batches(qids):
    for q, e in wd(b, 'props=claims').items():
        p31[q] = [c['mainsnak']['datavalue']['value']['id'] for c in e.get('claims', {}).get('P31', []) if c['mainsnak'].get('datavalue')][:8]
    time.sleep(2)
lab = {}
for b in batches(sorted({x for v in p31.values() for x in v})):
    for q, e in wd(b, 'props=labels&languages=en').items():
        lab[q] = (e.get('labels', {}).get('en') or {}).get('value', '')
    time.sleep(2)
for key, v in info.items():
    labels = [lab.get(x, '') for x in p31.get(v['q'], [])]
    cache[key] = {'t': short(labels) or ADDR.get(v['addr']), 'p31': labels[:3], 'addr': v['addr']}
json.dump(cache, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('done', len(cache), 'untyped:', [k for k, v in cache.items() if not v['t']][:40])
