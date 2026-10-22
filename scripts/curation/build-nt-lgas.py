#!/usr/bin/env python3
"""Sets each Northern Territory spot's division in src/data/spotDistricts.json to its local government area (one of the NT's 17).

  python3 scripts/curation/build-nt-lgas.py [--only id,id]

OpenStreetMap has no council boundaries for the NT, so build-spot-districts.py falls back to the state; this uses the ABS ASGS 2023
LGA boundary service instead (point-in-polygon). Places the ABS leaves "Unincorporated" (national parks, Nhulunbuy, Yulara) go to the
nearest LGA by distance to its boundary, except Litchfield National Park and Mary River National Park, which are grouped with the
Litchfield Municipality they sit beside. Display names: City of Darwin / City of Palmerston, Litchfield Municipality, Alice Springs Town /
Katherine Town, Coomalie / Belyuen / Wagait Shire, and "<Name> Region" for the rest.
"""
import json, math, re, sys, urllib.parse, urllib.request
ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2023/LGA/MapServer/0/query?'
EXCL = {'Unincorporated NT', 'Darwin Waterfront Precinct', 'No usual address (NT)', 'Migratory - Offshore - Shipping (NT)'}
DISP = {'Darwin': 'City of Darwin', 'Palmerston': 'City of Palmerston', 'Litchfield': 'Litchfield Municipality', 'Alice Springs': 'Alice Springs Town',
        'Katherine': 'Katherine Town', 'Coomalie': 'Coomalie Shire', 'Belyuen': 'Belyuen Shire', 'Wagait': 'Wagait Shire'}
LITCHFIELD_GROUP = {'litchfield-1', 'litchfield-2', 'litchfield-3', 'litchfield-4', 'litchfield-5', 'litchfield-7', 'litchfield-8', 'mary-river-national-park'}
only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
get = lambda **p: json.load(urllib.request.urlopen(ABS + urllib.parse.urlencode(p), timeout=120))
polys = {f['attributes']['lga_name_2023'].strip(): f['geometry']['rings'] for f in get(where="state_name_2021='Northern Territory'", outFields='lga_name_2023', returnGeometry='true', outSR='4326', maxAllowableOffset='0.005', f='json')['features'] if f.get('geometry')}
def dist_km(lat, lon, rings):
    k = math.cos(math.radians(lat)); best = 9e9
    for r in rings:
        for i in range(len(r) - 1):
            ax, ay, bx, by = r[i][0] * k, r[i][1], r[i + 1][0] * k, r[i + 1][1]; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((lon * k - ax) * dx + (lat - ay) * dy) / L)); best = min(best, math.hypot(lon * k - (ax + t * dx), lat - (ay + t * dy)))
    return best * 111.0
districts = json.load(open('src/data/spotDistricts.json'))
src = open('src/data/spots.ts').read()
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'): continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if not (m and c) or districts.get(m.group(1), {}).get('r') != 'Northern Territory' or (only and m.group(1) not in only): continue
    sid, lat, lon = m.group(1), float(c.group(1)), float(c.group(2))
    hit = get(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json')['features']
    names = [n for n in {x['attributes']['lga_name_2023'].strip() for x in hit if x['attributes'].get('state_name_2021') == 'Northern Territory'} if n not in EXCL]
    name = names[0] if len(names) == 1 else min((dist_km(lat, lon, r), n) for n, r in polys.items() if n not in EXCL)[1]
    if sid in LITCHFIELD_GROUP: name = 'Litchfield'
    districts[sid] = {'d': DISP.get(name, name + ' Region'), 'c': 'AU', 'r': 'Northern Territory'}
open('src/data/spotDistricts.json', 'w').write(json.dumps(districts, indent=1, ensure_ascii=False))
print('done')
