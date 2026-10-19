#!/usr/bin/env python3
"""Checks that a hill, peak, lookout or summit spot's pin is ON the hill (COVERAGE.md → "Verifying coordinates").

  python3 scripts/curation/check-pin-elevation.py [--ids a,b] [--dest id] [--country NZ] [--all]

For every spot whose NAME or CATEGORY says it is high ground (Hill, Peak, Mount, Mt, Lookout, Summit, Tor, Head, Rock,
Falls excluded; or category viewpoint), it:
  1. reads the pin's ground elevation (Open-Elevation, ~30–90 m grid) and the highest ground within 600 m;
  2. asks OpenStreetMap (Overpass) for the named peak / viewpoint / lookout within 2 km whose name shares a word with the spot;
  3. flags the pin when the matching OSM feature is more than 250 m away, or the pin is more than 25 m BELOW the highest
     ground within 600 m (a lookout pinned on the flat beside its hill: Napier's Bluff Hill Lookout shipped 1.5 km west of
     the hill, at 8 m elevation on the plain, because a Wikivoyage listing named the town).
A flag is not always an error (a trailhead is deliberately low): move the pin onto the feature, or record why it is right.
Needs network. Prints one line per flagged spot with the suggested point.
"""
import json, re, sys, time, urllib.request, urllib.parse, math

args = sys.argv[1:]
opt = lambda f, d=None: args[args.index(f) + 1] if f in args else d
UA = 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'
KW = re.compile(r"\b(Hill|Hills|Peak|Mount|Mt|Lookout|Summit|Tor|Head|Rock|Bluff|Cone|Crater|Saddle|Pass|Point|Ridge|Viewpoint)\b", re.I)


def get(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Content-Type': 'application/json'})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:
            time.sleep(2 * (i + 1)); err = e
    return None


def elev(points):
    res = get('https://api.open-elevation.com/api/v1/lookup', json.dumps({'locations': [{'latitude': a, 'longitude': b} for a, b in points]}).encode())
    return [r['elevation'] for r in res['results']] if res else [None] * len(points)


def dist(a, b, c, d):
    return math.hypot((a - c) * 111320, (b - d) * 111320 * math.cos(math.radians(a)))


src = open('src/data/spots.ts').read()
rows = []
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'):
        continue
    m = re.search(r"id: ['\"]([^'\"]+)['\"]", l)
    if not m:
        continue
    sid = m.group(1)
    nm = re.search(r"name: (?:\"([^\"]*)\"|'([^']*)')", l); nm = (nm.group(1) or nm.group(2)) if nm else ''
    c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    cat = (re.search(r"category: '(\w+)'", l) or [None, ''])[1]
    if not c:
        continue
    lat, lon = float(c.group(1)), float(c.group(2))
    dst = (re.search(r"destinationId: ['\"]([^'\"]+)['\"]", l) or [None, ''])[1]
    if opt('--ids') and sid not in opt('--ids').split(','):
        continue
    if opt('--dest') and dst != opt('--dest'):
        continue
    if opt('--country', 'NZ') == 'NZ' and not (-48 < lat < -34 and 165 < lon < 179) and not opt('--ids'):
        continue
    if '--all' in args or opt('--ids') or KW.search(nm) or cat == 'viewpoint':
        rows.append((sid, nm, lat, lon, cat))

flags = 0
for sid, nm, lat, lon, cat in rows:
    words = {w.lower() for w in re.findall(r"[A-Za-zĀ-ſ]{4,}", nm)} - {'track', 'walk', 'beach', 'park', 'reserve'}
    q = f'[out:json][timeout:25];(node["natural"="peak"](around:2000,{lat},{lon});node["tourism"="viewpoint"](around:2000,{lat},{lon}););out;'
    osm = get('https://overpass-api.de/api/interpreter', ('data=' + urllib.parse.quote(q)).encode()) if True else None
    near = []
    for e in (osm or {}).get('elements', []):
        tg = e.get('tags', {}); n = (tg.get('name') or '').lower()
        match = any(w in n for w in words) if words else False
        near.append((dist(lat, lon, e['lat'], e['lon']), e['lat'], e['lon'], tg.get('name'), match, tg.get('natural') or tg.get('tourism')))
    named = sorted(x for x in near if x[4])
    probe = [(lat, lon)] + [(lat + dy / 111320, lon + dx / (111320 * math.cos(math.radians(lat)))) for dy, dx in ((400, 0), (-400, 0), (0, 400), (0, -400))]
    el = elev(probe)
    pin, hi = el[0], max([e for e in el if e is not None] or [None]) if any(e is not None for e in el) else None
    why = []
    if named and named[0][0] > 250:
        why.append(f"OSM {named[0][5]} \"{named[0][3]}\" is {named[0][0]:.0f} m away at {named[0][1]:.5f},{named[0][2]:.5f}")
    if pin is not None and hi is not None and hi - pin > 25 and cat in ('viewpoint', 'hike', 'nature', 'landmark') and not re.search(r'Track|Walk|Trail', nm):
        why.append(f"pin elevation {pin:.0f} m, ground {hi:.0f} m within 400 m")
    if why:
        flags += 1
        print(f'{sid}  {nm}: ' + '; '.join(why))
    time.sleep(1)
print(f'{flags} of {len(rows)} high-ground spots flagged')
