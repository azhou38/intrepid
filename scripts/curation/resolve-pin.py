#!/usr/bin/env python3
"""Finds a spot's pin from real map features, never from memory (COVERAGE.md → "Verifying coordinates").

  python3 scripts/curation/resolve-pin.py --name "Paritutu Rock" --category viewpoint --lat -39.06 --lon 174.04 [--wiki "Paritutu Rock"] [--json]

--lat/--lon is only a hint (a town or a rough pin): candidates are searched within 8 km of it. Candidates, each with its source
and OSM feature type:
  osm      OpenStreetMap features whose name shares a word with the spot, of the type the category implies (peak/viewpoint for a
           hill or lookout, beach for a beach, waterfall, the MIDPOINT of the route for a trail, track or hike (not its trailhead), the building for a museum, ...)
  nominatim OpenStreetMap features found by name through Nominatim when Overpass is down (the same OSM features, typed the same
           way, a trail's midpoint from its way geometry); calls are paced to one a second across processes (Nominatim's policy)
  photon   the Photon geocoder biased to the hint (last fallback when Overpass and Nominatim both fail)
  wiki     the spot's English Wikipedia coordinates (often rounded to the town: a reference, not a pin)
  commons  geotagged Commons files near the hint whose title shares a word with the spot
Prints the recommended point and a confidence: HIGH when two independent sources agree within 100 m, MEDIUM for one precise OSM
feature, LOW otherwise (then do not guess: leave the spot unpinned for the owner, or pin the midpoint of the agency's route and say so).
A recommended point has at least 5 decimal places; a spot written with round coordinates (-39.0640, 174.0400) is a memory pin.
"""
import fcntl, json, math, os, re, subprocess, sys, time, unicodedata, urllib.parse


def fold(t):
    return ''.join(c for c in unicodedata.normalize('NFKD', t or '') if not unicodedata.combining(c)).lower()


a = sys.argv[1:]
opt = lambda f, d=None: a[a.index(f) + 1] if f in a else d
name, cat, wiki = opt('--name'), opt('--category', ''), opt('--wiki')
if not name or opt('--lat') is None:
    sys.exit(__doc__)
lat0, lon0 = float(opt('--lat')), float(opt('--lon'))
UA = 'IntrepidApp-Curation/1.0'
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
allw = {fold(w) for w in re.findall(r"[A-Za-zĀ-ſ']{3,}", name)}
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


def overpass_up():
    # Probe Overpass's status page once and remember the answer for five minutes across processes: while it is down, every query
    # would wait out its timeout three times before the Nominatim fallback ran.
    f = '/tmp/resolve-pin-overpass-health'
    try:
        t, ok = open(f).read().split()
        if time.time() - float(t) < 300: return ok == '1'
    except Exception:
        pass
    r = subprocess.run(['curl', '-s', '-m', '10', '-o', '/dev/null', '-w', '%{http_code}', '-A', UA, 'https://overpass-api.de/api/status'], capture_output=True, text=True)
    ok = r.stdout.strip() == '200'
    open(f, 'w').write(f'{time.time()} {int(ok)}')
    return ok


OVERPASS_UP = overpass_up()


def search(selectors):
    if not OVERPASS_UP:
        return None, []
    body = ''
    for sel in selectors:
        k, v = sel.split('=')
        body += f'nwr["{k}"](around:8000,{lat0},{lon0});' if v == '*' else f'nwr["{k}"="{v}"](around:8000,{lat0},{lon0});'
    q = f'[out:json][timeout:30];({body});out center tags 300;'
    o = get('https://overpass-api.de/api/interpreter', ('data=' + urllib.parse.quote(q)).encode())
    found = []
    for e in (o or {}).get('elements', []):
        t = e.get('tags', {}); n = fold(t.get('name') or t.get('name:en') or '')
        hit = [w for w in words if w in n]
        if not hit: continue
        la, lo = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
        kind = next((f'{k}={t[k]}' for k in ('natural', 'tourism', 'waterway', 'historic', 'highway', 'amenity', 'leisure', 'man_made') if k in t), 'feature')
        found.append({'src': 'osm', 'name': t.get('name'), 'type': kind, 'lat': la, 'lon': lo, 'match': len(hit) / max(1, len(words))})
    return o, found


EXTRA = {'water': ['natural=water'], 'waterfall': ['waterway=waterfall'], 'beach': ['natural=beach'], 'bay': ['natural=bay'], 'peak': ['natural=peak'], 'viewpoint': ['tourism=viewpoint'], 'cave': ['natural=cave_entrance']}
sels = list(dict.fromkeys(sels + [x for w in allw if w in {'tarns', 'tarn', 'lake', 'lakes', 'falls', 'beach', 'bay', 'mount', 'peak', 'hill', 'summit', 'lookout', 'cave', 'caves'}
                                   for x in EXTRA.get({'tarns': 'water', 'tarn': 'water', 'lake': 'water', 'lakes': 'water', 'falls': 'waterfall', 'beach': 'beach', 'bay': 'bay', 'mount': 'peak', 'peak': 'peak', 'hill': 'peak', 'summit': 'peak', 'lookout': 'viewpoint', 'cave': 'cave', 'caves': 'cave'}[w], [])]))
o, found = search(sels)
if o is not None and not found:
    o, found = search(ALL)   # the category may not name the feature type (Pouakai Tarns are natural=water, not a viewpoint)
cands += found
# A trail or hike is pinned roughly at the CENTRE of the route (halfway along its length), not at the trailhead.
if cat == 'hike' or re.search(r'\b(Track|Walk|Walkway|Trail|Circuit|Crossing|Route)\b', name, re.I):
    tq = '[out:json][timeout:40];(way["highway"~"path|track|footway|steps"](around:8000,%s,%s);rel["route"~"hiking|foot"](around:8000,%s,%s););out geom tags 400;' % (lat0, lon0, lat0, lon0)
    to = get('https://overpass-api.de/api/interpreter', ('data=' + urllib.parse.quote(tq)).encode()) if OVERPASS_UP else None
    for e in (to or {}).get('elements', []):
        t = e.get('tags', {}); n = fold(t.get('name') or '')
        if not [w for w in words if w in n]: continue
        pts = []
        if e['type'] == 'way':
            pts = [(g['lat'], g['lon']) for g in e.get('geometry', [])]
        else:
            for m in e.get('members', []):
                pts += [(g['lat'], g['lon']) for g in m.get('geometry', [])] if m.get('geometry') else []
        if len(pts) < 2: continue
        seg = [dist(*pts[i], *pts[i + 1]) for i in range(len(pts) - 1)]; half = sum(seg) / 2; acc = 0
        for i, d in enumerate(seg):
            if acc + d >= half:
                f = (half - acc) / d if d else 0
                mid = (pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])); break
            acc += d
        cands.append({'src': 'osm', 'name': t.get('name'), 'type': f'trail midpoint ({sum(seg)/1000:.1f} km)', 'lat': mid[0], 'lon': mid[1], 'match': 1.0})

def nominatim(q):
    # One request a second across every process running this script (Nominatim's usage policy): a lock file holds the time
    # of the last call.
    lock = '/tmp/resolve-pin-nominatim.lock'
    with open(lock, 'a+') as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0); last = float(fh.read().strip() or 0)
        wait = 1.1 - (time.time() - last)
        if wait > 0: time.sleep(wait)
        r = get('https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(q))
        fh.seek(0); fh.truncate(); fh.write(str(time.time())); fh.flush()
        fcntl.flock(fh, fcntl.LOCK_UN)
    return r


def flat_pts(geo):
    t, c = geo.get('type'), geo.get('coordinates')
    if t == 'LineString': return [(y, x) for x, y in c]
    if t == 'MultiLineString': return [(y, x) for line in c for x, y in line]
    if t == 'GeometryCollection': return [p for g in geo.get('geometries', []) for p in flat_pts(g)]
    return []


nom_ok = False
if o is None:
    d = 0.08
    res = nominatim({'format': 'jsonv2', 'q': name, 'viewbox': f'{lon0 - d},{lat0 + d},{lon0 + d},{lat0 - d}', 'bounded': 1,
                     'limit': 10, 'polygon_geojson': 1})
    nom_ok = res is not None
    is_trail = cat == 'hike' or re.search(r'\b(Track|Walk|Walkway|Trail|Circuit|Crossing|Route)\b', name, re.I)
    short = ' '.join(w for w in re.findall(r"[A-Za-zĀ-ſ']+", name) if fold(w) in words)
    if nom_ok and not is_trail and short and fold(short) != fold(name):
        # OSM's name can differ from the visitor name ("Sugar Loaf Rock"): look again by the distinctive words alone. Not for a
        # trail, where a peak or car park at one end must not stand in for the route's midpoint.
        res = (res or []) + (nominatim({'format': 'jsonv2', 'q': short, 'viewbox': f'{lon0 - d},{lat0 + d},{lon0 + d},{lat0 - d}',
                                        'bounded': 1, 'limit': 10, 'polygon_geojson': 1}) or [])
    squash = lambda t: fold(t).replace(' ', '').replace('-', '')
    # Only classes that are places: a road named after one ("Wave Rock Road", "Cable Beach Road West") is not it. Paths and
    # routes only for a trail.
    PLACE_CLASSES = {'natural', 'tourism', 'leisure', 'historic', 'waterway', 'man_made', 'amenity', 'boundary', 'place', 'landuse'}
    for e in res or []:
        if e.get('category') not in PLACE_CLASSES and not (is_trail and e.get('category') in ('highway', 'route')):
            continue
        if e.get('category') == 'tourism' and e.get('type') in ('caravan_site', 'camp_site', 'hotel', 'motel', 'guest_house', 'hostel', 'chalet', 'apartment', 'information', 'alpine_hut', 'wilderness_hut'):
            continue   # the caravan park or visitor info office named after a place is not the place
        if e.get('category') == 'amenity' and e.get('type') in ('parking', 'toilets', 'restaurant', 'cafe', 'fuel', 'bar', 'pub', 'fast_food'):
            continue
        if e.get('category') == 'highway' and e.get('type') not in ('path', 'footway', 'track', 'bridleway', 'steps', 'cycleway'):
            continue
        n = fold(e.get('name') or e.get('display_name', '').split(',')[0])
        if not [w for w in words if w in n or w in squash(n)]: continue
        la, lo = float(e['lat']), float(e['lon']); kind = f"{e.get('category')}={e.get('type')}"
        pts = flat_pts(e.get('geojson') or {})
        trail = is_trail and len(pts) > 1
        if trail:
            seg = [dist(*pts[i], *pts[i + 1]) for i in range(len(pts) - 1)]; half = sum(seg) / 2; acc = 0
            for i, dd in enumerate(seg):
                if acc + dd >= half:
                    f = (half - acc) / dd if dd else 0
                    la, lo = pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1]); break
                acc += dd
            kind = f'trail midpoint ({sum(seg)/1000:.1f} km, nominatim)'
        cands.append({'src': 'osm', 'name': e.get('name'), 'type': kind + ('' if trail else ' (nominatim)'), 'lat': la, 'lon': lo, 'match': 1.0})
if o is None and not nom_ok:
    p = get('https://photon.komoot.io/api/?limit=8&lat=%s&lon=%s&q=%s' % (lat0, lon0, urllib.parse.quote(name)))
    for f in (p or {}).get('features', []):
        pr = f['properties']; lo, la = f['geometry']['coordinates']
        if dist(lat0, lon0, la, lo) < 8000 and words & {fold(w) for w in re.findall(r"\w{3,}", pr.get('name', ''))}:
            cands.append({'src': 'photon', 'name': pr.get('name'), 'type': f"{pr.get('osm_key')}={pr.get('osm_value')}", 'lat': la, 'lon': lo, 'match': 0.6})
if wiki or name:
    w = get('https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&format=json&titles=' + urllib.parse.quote(wiki or name))
    for pg in ((w or {}).get('query', {}).get('pages', {})).values():
        for c in pg.get('coordinates', []):
            cands.append({'src': 'wiki', 'name': pg['title'], 'type': 'article', 'lat': c['lat'], 'lon': c['lon'], 'match': 1.0})
g = get(f'https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord={lat0}|{lon0}&gsradius=8000&gslimit=100&gsnamespace=6&format=json')
files = [x for x in (g or {}).get('query', {}).get('geosearch', []) if words & {fold(w) for w in re.findall(r"\w{3,}", x['title'])}]
if files:
    la = sorted(x['lat'] for x in files)[len(files) // 2]; lo = sorted(x['lon'] for x in files)[len(files) // 2]
    cands.append({'src': 'commons', 'name': f'{len(files)} geotagged files', 'type': 'photo median', 'lat': la, 'lon': lo, 'match': 0.5})
for c in cands:
    c['from_hint_m'] = round(dist(lat0, lon0, c['lat'], c['lon']))
KIND_OF = {'tarns': 'water', 'tarn': 'water', 'lake': 'water', 'lakes': 'water', 'falls': 'waterfall', 'beach': 'beach', 'bay': 'bay', 'mount': 'peak',
           'peak': 'peak', 'hill': 'peak', 'summit': 'peak', 'lookout': 'viewpoint', 'museum': 'museum', 'caves': 'cave', 'cave': 'cave'}
want = {KIND_OF[w] for w in allw if w in KIND_OF}
kind_ok = lambda c: not want or any(k in str(c['type']) or k in fold(c.get('name') or '') for k in want)   # 'Pouakai Tarns' wants water/attraction, not the peak 'Pouakai'
cands.sort(key=lambda c: (c['src'] != 'osm', not kind_ok(c), not str(c['type']).startswith('trail midpoint') if (cat == 'hike') else False, -c['match'], c['from_hint_m']))
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
