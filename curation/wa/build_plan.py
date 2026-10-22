#!/usr/bin/env python3
"""Normalises the seven WA placement.json files into curation/wa/plan/<region>.json and applies the owner's decisions
(curation/wa/owner-review.md section 2, approved 2026-10-22). Run from the repo root. Ids have not shipped, so a spot
that changes destination is renumbered here.

plan: { region, destinations: [ {id, name, category, rank, coordinates, coordinates_source, defaultZoomSpanKm,
         name_evidence, spots: [ids]} ], spots: [ {id, name, destination|None, category, icon, bio, wiki, coordinates,
         coordinates_source, hours, visitHoursMin, visitHoursMax, free, costMin, costMax, currency, ticketUrl, sources,
         needs_research, note} ] }
"""
import json, math, os, re

REG = ['perth', 'south-west', 'great-southern', 'golden-outback', 'coral-coast', 'pilbara', 'kimberley']
SPOT_KEYS = ['placements', 'entries', 'spots']
DEST_KEYS = ['proposed_new_destinations', 'destinations', 'new_destinations', 'proposed_destinations']
FIELDS = ['name', 'category', 'icon', 'bio', 'wiki', 'coordinates', 'coordinates_source', 'hours', 'visitHoursMin',
          'visitHoursMax', 'free', 'costMin', 'costMax', 'currency', 'ticketUrl', 'closedDays', 'needs_research']

existing = set(re.findall(r"\bid: ['\"]([^'\"]+)['\"]", open('src/data/destinations.ts').read() + open('src/data/spots.ts').read()))
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower().replace("'", '')).strip('-')


def norm_coords(c):
    if not c:
        return None
    if isinstance(c, dict):
        lat = c.get('latitude', c.get('lat')); lon = c.get('longitude', c.get('lng', c.get('lon')))
        return {'latitude': lat, 'longitude': lon} if lat is not None and lon is not None else None
    if isinstance(c, (list, tuple)) and len(c) == 2:
        return {'latitude': c[0], 'longitude': c[1]}
    return None


def load(r):
    p = json.load(open(f'curation/wa/region-wa-{r}/placement.json'))
    raw = next(p[k] for k in SPOT_KEYS if k in p)
    dests = next((p[k] for k in DEST_KEYS if k in p), [])
    spots = []
    for e in raw:
        if e.get('action') not in ('spot', 'standalone'):
            continue
        src = dict(e.get('spot') or {}); src.update({k: v for k, v in e.items() if k != 'spot'})
        s = {k: src.get(k) for k in FIELDS}
        s['id'] = e['id']
        s['destination'] = src.get('destination') if e['action'] == 'spot' else None
        s['coordinates'] = norm_coords(src.get('coordinates'))
        s['sources'] = src.get('sources') or src.get('counted_source_urls') or src.get('counted_sources')
        s['needs_research'] = sorted(set(src.get('needs_research') or []) | ({'coordinates'} if not s['coordinates'] else set()))
        s['note'] = src.get('reason')
        spots.append(s)
    out = []
    for d in dests:
        out.append({'id': d['id'], 'name': d['name'], 'category': d.get('category'), 'rank': d.get('rank'),
                    'coordinates': norm_coords(d.get('coordinates')), 'coordinates_source': d.get('coordinates_source'),
                    'defaultZoomSpanKm': d.get('defaultZoomSpanKm') or d.get('span_km'),
                    'name_evidence': d.get('name_evidence'), 'spots': list(d.get('spots') or [])})
    return {'region': f'wa-{r}', 'destinations': out, 'spots': spots}


P = {r: load(r) for r in REG}
log = []


def dest(r, i):
    return next(d for d in P[r]['destinations'] if d['id'] == i)


def spots_of(r, i):
    order = dest(r, i)['spots']
    by = {s['id']: s for s in P[r]['spots'] if s['destination'] == i}
    return [by[x] for x in order if x in by] + [s for s in by.values() if s['id'] not in order]


def new_slug(name):
    b = slug(name); i = b; n = 2
    taken = existing | {s['id'] for p in P.values() for s in p['spots']} | {d['id'] for p in P.values() for d in p['destinations']}
    while i in taken:
        i = f'{b}-{n}'; n += 1
    return i


def make_standalone(r, s):
    s['destination'] = None; old = s['id']; s['id'] = new_slug(s['name']); log.append(f'{old} -> standalone {s["id"]}')


def renumber(r, d_id, ordered):
    d = dest(r, d_id)
    for k, s in enumerate(ordered, 1):
        old = s['id']; s['id'] = f'{d_id}-{k}'; s['destination'] = d_id
        if old != s['id']:
            log.append(f'{old} -> {s["id"]}')
    d['spots'] = [s['id'] for s in ordered]


def move_region(src_r, dst_r, s):
    P[src_r]['spots'].remove(s); P[dst_r]['spots'].append(s)


def drop_dest(r, i):
    P[r]['destinations'] = [d for d in P[r]['destinations'] if d['id'] != i]


# 2. Hutt River Principality: dissolved in 2020, not open to visitors.
for s in list(P['coral-coast']['spots']):
    if s['name'].startswith('Hutt River'):
        P['coral-coast']['spots'].remove(s); log.append(f'removed {s["id"]} {s["name"]}')

# 1. One Ningaloo destination (rank 1) holding Cape Range NP's, Exmouth's and Coral Bay's spots and the reef.
cc = P['coral-coast']
cape = spots_of('coral-coast', 'cape-range-national-park'); exm = spots_of('coral-coast', 'exmouth')
loose = {s['name']: s for s in cc['spots'] if s['destination'] is None}
reef = loose.get('Ningaloo Reef'); coral = loose.get('Coral Bay'); five = loose.get('Five Fingers Reef')
park = {'id': 'tmp-cape-range', 'name': 'Cape Range National Park', 'destination': None, 'category': 'nature', 'icon': '🏜️',
        'bio': None, 'wiki': None, 'coordinates': None, 'coordinates_source': None, 'sources': ['https://exploreparks.dbca.wa.gov.au/park/cape-range-national-park'],
        'needs_research': ['coordinates', 'bio', 'hours', 'cost', 'ticketUrl'], 'note': 'Owner decision 1: the park becomes a spot of Ningaloo (visitor point: Milyering or Yardie Creek, not shared with another spot).'}
town = {'id': 'tmp-exmouth', 'name': 'Exmouth', 'destination': None, 'category': 'landmark', 'icon': '🏘️', 'bio': None,
        'wiki': 'Exmouth, Western Australia', 'coordinates': None, 'coordinates_source': None, 'sources': [],
        'needs_research': ['coordinates', 'bio'], 'note': 'Owner decision 1: the town is a spot of Ningaloo (the base for the reef and the park).'}
for x in (park, town):
    for k in FIELDS:
        x.setdefault(k, None)
    cc['spots'].append(x)
ordered = [s for s in [reef] if s] + [s for s in cape if s['name'] in ('Turquoise Bay',)] + [s for s in [coral, park] if s] \
    + [s for s in cape if s['name'] != 'Turquoise Bay'] + [s for s in [five, town] if s] + exm
cdc = [d for d in cc['destinations'] if d['id'] in ('cape-range-national-park', 'exmouth')]
cc['destinations'] = [d for d in cc['destinations'] if d['id'] not in ('cape-range-national-park', 'exmouth')]
cc['destinations'].append({'id': 'ningaloo', 'name': 'Ningaloo', 'category': 'nature', 'rank': 1, 'coordinates': None,
                           'coordinates_source': None, 'defaultZoomSpanKm': None, 'spots': [],
                           'name_evidence': {'source': 'Owner decision 1 (2026-10-22); Ningaloo Coast World Heritage Area; Tourism WA "Ningaloo Reef"', 'wording': 'Ningaloo'}})
renumber('coral-coast', 'ningaloo', ordered)

# 3. Broome rank 2.
dest('kimberley', 'broome')['rank'] = 2

# 4. Rockingham folds into Perth (its spots become Perth's; the town is mentioned in Perth's description).
rk = spots_of('perth', 'rockingham'); drop_dest('perth', 'rockingham')
renumber('perth', 'perth', spots_of('perth', 'perth') + rk)

# 6. Busselton folds into the Margaret River Region.
bs = spots_of('south-west', 'busselton'); drop_dest('south-west', 'busselton')
renumber('south-west', 'margaret-river-region', spots_of('south-west', 'margaret-river-region') + bs)

# 10. Mandalay Beach, Fernhook Falls and Mount Frankland NP go under Walpole Wilderness (Great Southern).
mv = [s for s in P['south-west']['spots'] if s['name'] in ('Mandalay Beach', 'Fernhook Falls', 'Mount Frankland National Park')]
for s in mv:
    move_region('south-west', 'great-southern', s); s['destination'] = 'walpole-wilderness'
renumber('great-southern', 'walpole-wilderness', spots_of('great-southern', 'walpole-wilderness'))

# 13. Ravensthorpe is not a destination: its spots stand alone.
for s in spots_of('golden-outback', 'ravensthorpe'):
    make_standalone('golden-outback', s)
drop_dest('golden-outback', 'ravensthorpe')

# 14. Denmark is a town.
dest('great-southern', 'denmark')['category'] = 'city'

# Renumber every other destination's spots 1..n in importance order (ids have not shipped) so numbering has no gaps.
for r in REG:
    for d in P[r]['destinations']:
        if d['id'] not in ('ningaloo', 'perth', 'margaret-river-region', 'walpole-wilderness'):
            renumber(r, d['id'], spots_of(r, d['id']))
    for s in P[r]['spots']:
        if s['id'].startswith('tmp-'):
            make_standalone(r, s)

os.makedirs('curation/wa/plan', exist_ok=True)
for r in REG:
    json.dump(P[r], open(f'curation/wa/plan/{r}.json', 'w'), indent=1, ensure_ascii=False)
open('curation/wa/plan/changes.log', 'w').write('\n'.join(log) + '\n')
tot = sum(len(p['spots']) for p in P.values()); nd = sum(len(p['destinations']) for p in P.values())
sa = sum(1 for p in P.values() for s in p['spots'] if not s['destination'])
ids = [s['id'] for p in P.values() for s in p['spots']]
print(f'{nd} destinations, {tot} spots ({sa} standalone); duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}')
for r in REG:
    print(r, [(d['id'], d['rank'], len(d['spots'])) for d in P[r]['destinations']])
