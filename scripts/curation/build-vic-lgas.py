#!/usr/bin/env python3
"""Sets each Victorian spot's division in src/data/spotDistricts.json to its local government area (one of Victoria's 79),
from the ABS ASGS 2023 LGA boundary service (point-in-polygon), so a Victorian spot is never filed under the state.

  python3 scripts/curation/build-vic-lgas.py [--only id,id]

Spots are the ones in curation/*/region-vic-*/apply-placement.json. A point the ABS leaves outside every LGA (offshore, a
boundary sliver) keeps its existing entry and is printed.
"""
import glob, json, re, sys, urllib.parse, urllib.request
ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2023/LGA/MapServer/0/query?'
only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
ids = set()
for f in glob.glob('curation/*/region-vic-*/apply-placement.json'):
    for e in json.load(open(f))['placements']:
        ids.add(e['id'])
districts = json.load(open('src/data/spotDistricts.json'))
src = open('src/data/spots.ts').read()
n = 0
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'): continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if not (m and c) or m.group(1) not in ids or (only and m.group(1) not in only): continue
    sid, lat, lon = m.group(1), float(c.group(1)), float(c.group(2))
    q = ABS + urllib.parse.urlencode(dict(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json'))
    hit = None
    for _ in range(3):
        try:
            hit = json.load(urllib.request.urlopen(q, timeout=60))['features']; break
        except Exception:
            pass
    names = sorted({x['attributes']['lga_name_2023'].strip() for x in (hit or []) if x['attributes'].get('state_name_2021') == 'Victoria'})
    if len(names) == 1:
        districts[sid] = {'d': names[0], 'c': 'AU', 'r': 'Victoria'}; n += 1
    else:
        print('no single LGA for', sid, lat, lon, names)
open('src/data/spotDistricts.json', 'w').write(json.dumps(districts, indent=1, ensure_ascii=False))
print('set', n)
