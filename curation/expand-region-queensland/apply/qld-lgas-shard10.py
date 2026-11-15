#!/usr/bin/env python3
"""Sets the division of the new Queensland spots (apply/ids.txt + black-stump-blackall) in src/data/spotDistricts.json to the
local government area from the ABS ASGS 2023 LGA boundary service (point-in-polygon): OpenStreetMap's reverse geocoder has no
county for much of Queensland and returns 'Queensland'. Same method as scripts/curation/build-nt-lgas.py."""
import json, re, urllib.parse, urllib.request
ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2023/LGA/MapServer/0/query?'
get = lambda **p: json.load(urllib.request.urlopen(ABS + urllib.parse.urlencode(p), timeout=120))
ids = set(['whitsundays-10','townsville-2','townsville-3','townsville-6','townsville-8','townsville-9','ingham-1'])
ids.discard('black-stump')
d = json.load(open('src/data/spotDistricts.json'))
bad = []
for l in open('src/data/spots.ts'):
    m = re.search(r"^  \{ id: '([^']+)'", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if not (m and c and m.group(1) in ids): continue
    sid, lat, lon = m.group(1), float(c.group(1)), float(c.group(2))
    hit = get(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json')['features']
    if not hit:   # a beach or reef point just off the simplified coastline: take the LGA within 3 km
        hit = get(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', distance='3000', units='esriSRUnit_Meter', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json')['features']
    names = sorted({re.sub(r' \(Qld\)$', '', x['attributes']['lga_name_2023'].strip()) for x in hit if x['attributes'].get('state_name_2021') == 'Queensland'})
    if len(names) != 1 or 'nincorporated' in names[0]:
        bad.append((sid, lat, lon, names)); continue
    d[sid] = {'d': names[0], 'c': 'AU', 'r': 'Queensland'}
open('src/data/spotDistricts.json', 'w').write(json.dumps(d, indent=1, ensure_ascii=False))
print('unresolved', bad)
