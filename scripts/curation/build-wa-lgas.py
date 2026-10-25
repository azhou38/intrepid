#!/usr/bin/env python3
"""Sets each Western Australian spot's division in src/data/spotDistricts.json to its local government area (one of WA's 137).

  python3 scripts/curation/build-wa-lgas.py [--only id,id]

Nominatim has no WA council boundaries, so build-spot-districts.py falls back to the state (or a bare "Perth"); this uses the ABS
ASGS 2023 LGA boundary service instead (point-in-polygon), as build-nt-lgas.py does for the NT. A point in no LGA (an offshore island
or reef, Rottnest Island) goes to the nearest LGA by distance to its boundary. Display names are each council's official name with
its kind ("City of Perth", "Shire of Mundaring", "Town of Port Hedland"), from the current councils listed in Wikipedia's "Local
government areas of Western Australia" (October 2026), keyed by the ABS name.
"""
import json, math, re, sys, urllib.parse, urllib.request
ABS = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2023/LGA/MapServer/0/query?'
OFFICIAL = {
    "Albany": "City of Albany",
    "Armadale": "City of Armadale",
    "Ashburton": "Shire of Ashburton",
    "Augusta Margaret River": "Shire of Augusta Margaret River",
    "Bassendean": "Town of Bassendean",
    "Bayswater": "City of Bayswater",
    "Belmont": "City of Belmont",
    "Beverley": "Shire of Beverley",
    "Boddington": "Shire of Boddington",
    "Boyup Brook": "Shire of Boyup Brook",
    "Bridgetown-Greenbushes": "Shire of Bridgetown-Greenbushes",
    "Brookton": "Shire of Brookton",
    "Broome": "Shire of Broome",
    "Broomehill-Tambellup": "Shire of Broomehill-Tambellup",
    "Bruce Rock": "Shire of Bruce Rock",
    "Bunbury": "City of Bunbury",
    "Busselton": "City of Busselton",
    "Cambridge": "Town of Cambridge",
    "Canning": "City of Canning",
    "Capel": "Shire of Capel",
    "Carnamah": "Shire of Carnamah",
    "Carnarvon": "Shire of Carnarvon",
    "Chapman Valley": "Shire of Chapman Valley",
    "Chittering": "Shire of Chittering",
    "Claremont": "Town of Claremont",
    "Cockburn": "City of Cockburn",
    "Collie": "Shire of Collie",
    "Coolgardie": "Shire of Coolgardie",
    "Coorow": "Shire of Coorow",
    "Corrigin": "Shire of Corrigin",
    "Cottesloe ": "Town of Cottesloe",
    "Cranbrook": "Shire of Cranbrook",
    "Cuballing": "Shire of Cuballing",
    "Cue": "Shire of Cue",
    "Cunderdin": "Shire of Cunderdin",
    "Dalwallinu": "Shire of Dalwallinu",
    "Dandaragan": "Shire of Dandaragan",
    "Dardanup": "Shire of Dardanup",
    "Denmark": "Shire of Denmark",
    "Derby-West Kimberley": "Shire of Derby-West Kimberley",
    "Donnybrook-Balingup": "Shire of Donnybrook-Balingup",
    "Dowerin": "Shire of Dowerin",
    "Dumbleyung": "Shire of Dumbleyung",
    "Dundas": "Shire of Dundas",
    "East Fremantle": "Town of East Fremantle",
    "East Pilbara": "Shire of East Pilbara",
    "Esperance": "Shire of Esperance",
    "Exmouth": "Shire of Exmouth",
    "Fremantle": "City of Fremantle",
    "Gingin": "Shire of Gingin",
    "Gnowangerup": "Shire of Gnowangerup",
    "Goomalling": "Shire of Goomalling",
    "Gosnells": "City of Gosnells",
    "Greater Geraldton": "City of Greater Geraldton",
    "Halls Creek": "Shire of Halls Creek",
    "Harvey": "Shire of Harvey",
    "Irwin": "Shire of Irwin",
    "Jerramungup": "Shire of Jerramungup",
    "Joondalup": "City of Joondalup",
    "Kalamunda": "City of Kalamunda",
    "Kalgoorlie-Boulder": "City of Kalgoorlie-Boulder",
    "Karratha": "City of Karratha",
    "Katanning": "Shire of Katanning",
    "Kellerberrin": "Shire of Kellerberrin",
    "Kent": "Shire of Kent",
    "Kojonup": "Shire of Kojonup",
    "Kondinin": "Shire of Kondinin",
    "Koorda": "Shire of Koorda",
    "Kulin": "Shire of Kulin",
    "Kwinana": "City of Kwinana",
    "Lake Grace": "Shire of Lake Grace",
    "Laverton": "Shire of Laverton",
    "Leonora": "Shire of Leonora",
    "Mandurah": "City of Mandurah",
    "Manjimup": "Shire of Manjimup",
    "Meekatharra": "Shire of Meekatharra",
    "Melville": "City of Melville",
    "Menzies": "Shire of Menzies",
    "Merredin": "Shire of Merredin",
    "Mingenew": "Shire of Mingenew",
    "Moora": "Shire of Moora",
    "Morawa": "Shire of Morawa",
    "Mosman Park": "Town of Mosman Park",
    "Mount Magnet": "Shire of Mount Magnet",
    "Mount Marshall": "Shire of Mount Marshall",
    "Mukinbudin": "Shire of Mukinbudin",
    "Mundaring": "Shire of Mundaring",
    "Murchison": "Shire of Murchison",
    "Murray": "Shire of Murray",
    "Nannup": "Shire of Nannup",
    "Narembeen": "Shire of Narembeen",
    "Narrogin": "Shire of Narrogin",
    "Nedlands": "City of Nedlands",
    "Ngaanyatjarraku": "Shire of Ngaanyatjarraku",
    "Northam": "Shire of Northam",
    "Northampton": "Shire of Northampton",
    "Nungarin": "Shire of Nungarin",
    "Peppermint Grove": "Shire of Peppermint Grove",
    "Perenjori": "Shire of Perenjori",
    "Perth": "City of Perth",
    "Pingelly": "Shire of Pingelly",
    "Plantagenet": "Shire of Plantagenet",
    "Port Hedland": "Town of Port Hedland",
    "Quairading": "Shire of Quairading",
    "Ravensthorpe": "Shire of Ravensthorpe",
    "Rockingham": "City of Rockingham",
    "Sandstone": "Shire of Sandstone",
    "Serpentine-Jarrahdale": "Shire of Serpentine-Jarrahdale",
    "Shark Bay": "Shire of Shark Bay",
    "South Perth": "City of South Perth",
    "Stirling": "City of Stirling",
    "Subiaco": "City of Subiaco",
    "Swan": "City of Swan",
    "Tammin": "Shire of Tammin",
    "Three Springs": "Shire of Three Springs",
    "Toodyay": "Shire of Toodyay",
    "Trayning": "Shire of Trayning",
    "Upper Gascoyne": "Shire of Upper Gascoyne",
    "Victoria Park": "Town of Victoria Park",
    "Victoria Plains": "Shire of Victoria Plains",
    "Vincent": "City of Vincent",
    "Wagin": "Shire of Wagin",
    "Wandering": "Shire of Wandering",
    "Wanneroo": "City of Wanneroo",
    "Waroona": "Shire of Waroona",
    "West Arthur": "Shire of West Arthur",
    "Westonia": "Shire of Westonia",
    "Wickepin": "Shire of Wickepin",
    "Williams": "Shire of Williams",
    "Wiluna": "Shire of Wiluna",
    "Wongan-Ballidu": "Shire of Wongan-Ballidu",
    "Woodanilling": "Shire of Woodanilling",
    "Wyalkatchem": "Shire of Wyalkatchem",
    "Wyndham-East Kimberley": "Shire of Wyndham-East Kimberley",
    "Yalgoo": "Shire of Yalgoo",
    "Yilgarn": "Shire of Yilgarn",
    "York": "Shire of York",
}
only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
get = lambda **p: json.load(urllib.request.urlopen(ABS + urllib.parse.urlencode(p), timeout=120))
polys = None
def nearest(lat, lon):
    global polys
    if polys is None:
        polys = {f['attributes']['lga_name_2023'].strip(): f['geometry']['rings'] for f in get(where="state_name_2021='Western Australia'", outFields='lga_name_2023', returnGeometry='true', outSR='4326', maxAllowableOffset='0.01', f='json')['features'] if f.get('geometry') and f['attributes']['lga_name_2023'].strip() in OFFICIAL}
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
    if not (m and c) or districts.get(m.group(1), {}).get('r') != 'Western Australia' or (only and m.group(1) not in only): continue
    sid, lat, lon = m.group(1), float(c.group(1)), float(c.group(2))
    hit = get(geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR='4326', spatialRel='esriSpatialRelIntersects', outFields='lga_name_2023,state_name_2021', returnGeometry='false', f='json')['features']
    names = [x['attributes']['lga_name_2023'].strip() for x in hit if x['attributes']['lga_name_2023'].strip() in OFFICIAL]
    name = names[0] if names else nearest(lat, lon)
    districts[sid] = {'d': OFFICIAL[name], 'c': 'AU', 'r': 'Western Australia'}; n += 1
open('src/data/spotDistricts.json', 'w').write(json.dumps(districts, indent=1, ensure_ascii=False))
print('done', n)
