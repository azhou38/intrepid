#!/usr/bin/env python3
"""Finalises curation/nz-rest/nsw-destinations/manifest.json for the NSW destination run and writes the per-destination briefs:
members resolved by alias, destinations with fewer than two member spots dropped (listed in `dropped`), duplicate ids merged,
span recomputed from the members (every member inside 75% of the span), a town's own standalone spot marked for removal,
and a photo pool per member (file, width, credit) from imageOverrides / externalPhotos / the image manifest."""
import json, re, math, collections
ALIAS = {'the bogey hole': 'Bogey Hole', 'little beach (bouddi)': 'Little Beach', 'north beach wollongong': 'North Wollongong Beach',
         'hars australian historical flying museum': 'HARS Aviation Museum', "rusconi's marble cathedral": "Rusconi's Marble Masterpiece",
         'royal flying doctor service bruce langford visitor centre': 'Royal Flying Doctor Outback Heritage Experience'}
src = open('src/data/spots.ts').read()
rows = {}
for l in src.split('\n'):
    m = re.match(r"\s*\{ id: ['\"]([^'\"]+)['\"]", l)
    if not m: continue
    n = re.search(r'\bname: (?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')', l); w = re.search(r'\bwiki: (?:"([^"]*)"|\'([^\']*)\')', l)
    c = re.search(r'latitude: (-?[\d.]+), longitude: (-?[\d.]+)', l); b = re.search(r'\bbio: "((?:[^"\\]|\\.)*)"', l)
    rows[m.group(1)] = {'name': n.group(1) or n.group(2), 'wiki': (w.group(1) or w.group(2)) if w else None, 'lat': float(c.group(1)), 'lon': float(c.group(2)),
                        'standalone': 'countryCode: "AU"' in l, 'bio': b.group(1) if b else ''}
byname = collections.defaultdict(list)
for i, r in rows.items():
    if r['standalone']: byname[r['name'].lower()].append(i)
ov = open('src/data/imageOverrides.ts').read()
override = dict(re.findall(r'^  "([^"]+)": "([^"]+)",$', ov[ov.index('export const WIKI_IMAGE_OVERRIDES'):], re.M))
nophoto = set(re.findall(r'^  "([^"]+)",$', ov[ov.index('export const NO_PHOTO'):], re.M))
ext = json.load(open('src/data/externalPhotos.json'))
man = json.load(open('src/data/imageManifest.json'))['entries']
def pool(sid):
    r = rows[sid]; k = r['wiki'] or r['name']
    if k in nophoto: return None
    e = man.get(k) or ext.get(k)
    f = override.get(k)
    if not e: return None
    cr = e.get('credit') or {}
    return {'file': f or ('external:' + k), 'width': e.get('ow'), 'credit': cr.get('by') if isinstance(cr, dict) else None, 'external': k in ext}
def dist(a, b, c, d):
    return math.hypot((a - c) * 111.0, (b - d) * 111.0 * math.cos(math.radians(a)))
dests = json.load(open('curation/nz-rest/nsw-destinations/manifest.json'))
seen = {}; out = []; dropped = []
for d in dests:
    mem = []
    for n in d['member_names']:
        n2 = ALIAS.get((n or '').lower(), n)
        ids = byname.get((n2 or '').lower(), [])
        if len(ids) > 1:   # same name twice (Tallow Beach, Shelly Beach): the one nearest the destination's centre
            c0 = d['centre']
            ids = sorted(ids, key=lambda i: dist(c0['latitude'], c0['longitude'], rows[i]['lat'], rows[i]['lon']))[:1]
        if ids: mem.append(ids[0])
    if d['id'] in seen and d['region'] != 'nsw-south-coast': continue   # morton: the south-coast pass owns it
    d['members'] = list(dict.fromkeys(mem))
    selfs = [i for i, r in rows.items() if r['standalone'] and r['name'].lower() in (d['name'].lower(), (d.get('self_name') or '').lower(), d['name'].lower().replace(' national park', '') + ' national park') and i not in d['members']]
    d['self_spots'] = selfs
    out_n = len(d['members'])
    if out_n < 2:
        dropped.append({'id': d['id'], 'name': d['name'], 'members': out_n, 'reason': 'fewer than two spots besides itself'}); continue
    c = d['centre']
    far = max(dist(c['latitude'], c['longitude'], rows[m]['lat'], rows[m]['lon']) for m in d['members'])
    d['span'] = max(15, int(math.ceil(far / 0.75 / 5.0) * 5))
    d['pool'] = {m: pool(m) for m in d['members']}
    seen[d['id']] = 1
    out = [x for x in out if x['id'] != d['id']] + [d]
json.dump({'destinations': out, 'dropped': dropped}, open('curation/nz-rest/nsw-destinations/final-manifest.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'destinations;', len(dropped), 'dropped:', [x['id'] for x in dropped])
for d in out:
    print(f"{d['id']:30s} members={len(d['members']):2d} span={d['span']:3d} self={d['self_spots']} nopool={[m for m,p in d['pool'].items() if not p or (p['width'] or 0) < 1280][:0]}")
