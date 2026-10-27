#!/usr/bin/env python3
"""Sets each South Australian spot's division in src/data/spotDistricts.json to its local government area (one of SA's 68 councils, plus the Outback Communities Authority's unincorporated area).

  python3 scripts/curation/build-sa-lgas.py [--only id,id]

Nominatim has no SA council boundaries, so build-spot-districts.py falls back to the state; this uses the ABS
ASGS 2023 LGA boundary service instead (point-in-polygon), as build-nt-lgas.py does for the NT. A point in no LGA (an offshore island
or reef, Kangaroo Island's offshore rocks) goes to the nearest LGA by distance to its boundary. Display names are each council's official name with
its kind ("City of Adelaide", "Adelaide Hills Council", "Town of Gawler"), from the current councils listed in Wikipedia's "Local
government areas of South Australia" (October 2026), keyed by the ABS name.
"""
import json, math, re, sys, urllib.parse, urllib.request
ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2023/LGA/MapServer/0/query?'
OFFICIAL = {
    "Adelaide": "City of Adelaide",
    "Adelaide Hills": "Adelaide Hills Council",
    "Adelaide Plains": "District Council of Adelaide Plains",
    "Alexandrina": "Alexandrina Council",
    "Anangu Pitjantjatjara Yankunytjatjara": "Anangu Pitjantjatjara Yankunytjatjara",
    "Barossa": "Barossa Council",
    "Barunga West": "District Council of Barunga West",
    "Berri Barmera": "Berri Barmera Council",
    "Burnside": "City of Burnside",
    "Campbelltown (SA)": "City of Campbelltown",
    "Ceduna": "District Council of Ceduna",
    "Charles Sturt": "City of Charles Sturt",
    "Clare and Gilbert Valleys": "Clare and Gilbert Valleys Council",
    "Cleve": "District Council of Cleve",
    "Coober Pedy": "District Council of Coober Pedy",
    "Coorong": "Coorong District Council",
    "Copper Coast": "Copper Coast Council",
    "Elliston": "District Council of Elliston",
    "Flinders Ranges": "Flinders Ranges Council",
    "Franklin Harbour": "District Council of Franklin Harbour",
    "Gawler": "Town of Gawler",
    "Goyder": "Regional Council of Goyder",
    "Grant": "District Council of Grant",
    "Holdfast Bay": "City of Holdfast Bay",
    "Kangaroo Island": "Kangaroo Island Council",
    "Karoonda East Murray": "District Council of Karoonda East Murray",
    "Kimba": "District Council of Kimba",
    "Kingston (SA)": "Kingston District Council",
    "Light": "Light Regional Council",
    "Lower Eyre Peninsula": "District Council of Lower Eyre Peninsula",
    "Loxton Waikerie": "District Council of Loxton Waikerie",
    "Maralinga Tjarutja": "Maralinga Tjarutja",
    "Marion": "City of Marion",
    "Mid Murray": "Mid Murray Council",
    "Mitcham": "City of Mitcham",
    "Mount Barker": "District Council of Mount Barker",
    "Mount Gambier": "City of Mount Gambier",
    "Mount Remarkable": "District Council of Mount Remarkable",
    "Murray Bridge": "Rural City of Murray Bridge",
    "Naracoorte Lucindale": "Naracoorte Lucindale Council",
    "Northern Areas": "Northern Areas Council",
    "Norwood Payneham and St Peters": "City of Norwood Payneham & St Peters",
    "Onkaparinga": "City of Onkaparinga",
    "Orroroo Carrieton": "District Council of Orroroo Carrieton",
    "Peterborough": "District Council of Peterborough",
    "Playford": "City of Playford",
    "Port Adelaide Enfield": "City of Port Adelaide Enfield",
    "Port Augusta": "City of Port Augusta",
    "Port Lincoln": "City of Port Lincoln",
    "Port Pirie": "Port Pirie Regional Council",
    "Prospect": "City of Prospect",
    "Renmark Paringa": "Renmark Paringa Council",
    "Robe": "District Council of Robe",
    "Roxby Downs": "Municipal Council of Roxby Downs",
    "Salisbury": "City of Salisbury",
    "Southern Mallee": "Southern Mallee District Council",
    "Streaky Bay": "District Council of Streaky Bay",
    "Tatiara": "Tatiara District Council",
    "Tea Tree Gully": "City of Tea Tree Gully",
    "Tumby Bay": "District Council of Tumby Bay",
    "Unincorporated SA": "Outback Communities Authority (unincorporated)",
    "Unley": "City of Unley",
    "Victor Harbor": "City of Victor Harbor",
    "Wakefield": "Wakefield Regional Council",
    "Walkerville": "Town of Walkerville",
    "Wattle Range": "Wattle Range Council",
    "West Torrens": "City of West Torrens",
    "Whyalla": "City of Whyalla",
    "Wudinna": "District Council of Wudinna",
    "Yankalilla": "District Council of Yankalilla",
    "Yorke Peninsula": "Yorke Peninsula Council",
}
only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
get = lambda **p: json.load(urllib.request.urlopen(ABS + urllib.parse.urlencode(p), timeout=120))
polys = None
def nearest(lat, lon):
    global polys
    if polys is None:
        polys = {f['attributes']['lga_name_2023'].strip(): f['geometry']['rings'] for f in get(where="state_name_2021='South Australia'", outFields='lga_name_2023', returnGeometry='true', outSR='4326', maxAllowableOffset='0.01', f='json')['features'] if f.get('geometry') and f['attributes']['lga_name_2023'].strip() in OFFICIAL}
    k = math.cos(math.radians(lat)); best = (9e9, None)
    for n, rings in polys.items():
        for r in rings:
            for i in range(len(r) - 1):
                ax, ay, bx, by = r[i][0] * k, r[i][1], r[i + 1][0] * k, r[i + 1][1]; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
                t = 0 if L == 0 else max(0, min(1, ((lon * k - ax) * dx + (lat - ay) * dy) / L))
                best = min(best, (math.hypot(lon * k - (ax + t * dx), lat - (ay + t * dy)), n))
    return best[1]
districts = json.load(open('src/data/spotDistricts.json'))
src = open('src/data/spots.ts').read()
n = 0
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'): continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    if not (m and c) or districts.get(m.group(1), {}).get('r') != 'South Australia' or (only and m.group(1) not in only): continue
    sid, lat, lon = m.group(1), float(c.group(1)), float(c.group(2))
    hit = get(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json')['features']
    names = [x['attributes']['lga_name_2023'].strip() for x in hit if x['attributes']['lga_name_2023'].strip() in OFFICIAL]
    name = names[0] if names else nearest(lat, lon)
    districts[sid] = {'d': OFFICIAL[name], 'c': 'AU', 'r': 'South Australia'}; n += 1
open('src/data/spotDistricts.json', 'w').write(json.dumps(districts, indent=1, ensure_ascii=False))
print('done', n)
