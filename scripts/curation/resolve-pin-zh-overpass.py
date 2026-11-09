#!/usr/bin/env python3
"""Second pass of resolve-pin-zh.py for China: looks each spot's Chinese name up in OpenStreetMap through Overpass, which finds the
named feature itself (peak, viewpoint, temple, waterfall, museum) instead of Nominatim's best text match.

  python3 scripts/curation/resolve-pin-zh-overpass.py <zh-results.json> <spots-input.json> <out.json>

Input: the output of resolve-pin-zh.py (zh name, Wikidata point) and the spots list (hint point; `radius` metres, default 15000). Only features named exactly the Chinese name within the radius count; they are recorded with type and distance. Confidence:
  HIGH    a precise point feature within 100 m of the Wikidata point
  MEDIUM  one precise point feature whose name contains the Chinese name (Wikidata absent or elsewhere)
  AREA    the best match is a park, lake, reserve or boundary: its centre is not a visitor point; pin it by hand at the visitor point
  LOW     nothing matched
A route (hiking relation) is recorded as AREA too: its middle must be taken from the route's geometry by hand.
One query per group of spots (their `region`), matching all the group's Chinese names at once inside the group's bounding box, because a mirror
answers a single query in about 15 s: spot by spot takes hours. A group's query is retried. Never writes src/data. Resumable."""
import json, math, os, subprocess, sys, time, urllib.parse

UA = 'IntrepidApp-Curation/1.0 (pin resolution)'
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
zhf, srcf, out = sys.argv[1], sys.argv[2], sys.argv[3]
POINT_KEYS = {'tourism': {'attraction', 'viewpoint', 'museum', 'gallery', 'zoo', 'theme_park', 'artwork'}, 'historic': None,
              'natural': {'peak', 'beach', 'cave_entrance', 'hot_spring', 'rock'}, 'waterway': {'waterfall'},
              'amenity': {'place_of_worship', 'marketplace'}, 'man_made': {'tower', 'lighthouse', 'pier', 'bridge'}, 'building': {'temple', 'pagoda', 'tower'}}
AREA_KEYS = {'leisure': None, 'boundary': None, 'natural': {'water', 'bay', 'wood', 'wetland', 'coastline'}, 'landuse': None, 'place': None, 'route': None}


def km(a, b):
    r = math.radians
    h = math.sin(r(b[0] - a[0]) / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def query(q):
    for i in range(8):
        base = MIRRORS[i % 2] if i < 4 else MIRRORS[1]
        r = subprocess.run(['curl', '-s', '-m', '45', '-A', UA, '--data-urlencode', 'data=' + q, base], capture_output=True, text=True)
        try:
            return json.loads(r.stdout)['elements']
        except Exception:
            time.sleep(2 + i)
    return None


def kind(t):
    for k, v in POINT_KEYS.items():
        if k in t and (v is None or t[k] in v):
            return 'point', f'{k}={t[k]}'
    for k, v in AREA_KEYS.items():
        if k in t and (v is None or t[k] in v):
            return 'area', f'{k}={t[k]}'
    return None, None


zh = json.load(open(zhf))
spots = {s['id']: s for s in json.load(open(srcf))}
done = json.load(open(out)) if os.path.exists(out) else {}
groups = {}
for sid, z in zh.items():
    s = spots.get(sid)
    if sid in done and not done[sid].get('retry'):
        continue
    if not z.get('zh') or not s or not s.get('coordinates'):
        done[sid] = {'confidence': 'LOW', 'why': 'no Chinese name' if not z.get('zh') else 'no hint'}
    else:
        groups.setdefault(s.get('region', ''), []).append(sid)
chunks = []
for region, ids in groups.items():
    ids = sorted(ids, key=lambda i: spots[i]['coordinates']['lat'])   # neighbours share a chunk, so its box stays small
    chunks += [(region, ids[k:k + 12]) for k in range(0, len(ids), 12)]
for region, ids in chunks:
    lats = [spots[i]['coordinates']['lat'] for i in ids]; lons = [spots[i]['coordinates']['lng'] for i in ids]
    m = 0.15   # about 15 km of margin round the group's hints
    bbox = f'{min(lats)-m},{min(lons)-m},{max(lats)+m},{max(lons)+m}'
    names = sorted({zh[i]['zh'] for i in ids})
    rx = '^(' + '|'.join(n.replace('"', '').replace('\\', '') for n in names) + ')$'
    els = query(f'[out:json][timeout:120];nwr["name"~"{rx}"]({bbox});out center tags 3000;')
    for i in ids:
        if els is None:
            done[i] = {'confidence': 'LOW', 'why': 'overpass unreachable', 'retry': True}
            continue
        name, h, rad = zh[i]['zh'], [spots[i]['coordinates']['lat'], spots[i]['coordinates']['lng']], spots[i].get('radius', 15000) / 1000
        found = []
        for e in els:
            t = e.get('tags', {})
            if t.get('name') != name:
                continue
            k, ty = kind(t)
            if not k:
                continue
            la, lo = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
            d = km(h, [la, lo])
            if d <= rad:
                found.append({'kind': k, 'type': ty, 'osm': f"{e['type']}/{e['id']}", 'name': t['name'], 'lat': la, 'lon': lo, 'from_hint_km': round(d, 2)})
        found.sort(key=lambda f: (f['kind'] != 'point', f['from_hint_km']))
        wd = zh[i].get('wikidata')
        conf, rec = 'LOW', None
        if found:
            rec = found[0]
            conf = 'AREA' if rec['kind'] == 'area' else 'HIGH' if wd and km(wd, [rec['lat'], rec['lon']]) <= 0.1 else 'MEDIUM'
        done[i] = {'zh': name, 'confidence': conf, 'recommended': rec, 'found': found[:5], 'wikidata': wd}
    json.dump(done, open(out, 'w'), indent=1, ensure_ascii=False)
    print(region, len(ids), 'spots', 'ok' if els is not None else 'UNREACHABLE', flush=True)
json.dump(done, open(out, 'w'), indent=1, ensure_ascii=False)
