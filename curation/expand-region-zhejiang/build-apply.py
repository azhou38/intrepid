#!/usr/bin/env python3
"""Zhejiang adapter: builds apply-placement.json (photoless entries) for every ready spot whose pin is HIGH or MEDIUM, and whose
destination has copy or is standalone. Prints what is left out and why. Never writes src/data."""
import json, glob, os
B = 'curation/expand-region-zhejiang/'
FIELDS = ['bio', 'icon', 'category', 'visitHoursMin', 'visitHoursMax', 'free', 'costMin', 'costMax', 'currency', 'costBasis', 'costPer', 'needs', 'ticketUrl', 'wiki', 'parkPass']
final, held, place = {}, set(), {}
for w in ('wave1', 'wave2'):
    final.update(json.load(open(f'{B}{w}/quill/final-spots.json')))
    for f in glob.glob(f'{B}{w}/quill/held*.json'):
        h = json.load(open(f))
        held |= set(h if isinstance(h, list) else h.keys()) if not isinstance(h, list) else {x if isinstance(x, str) else x.get('id') for x in h}
    for e in json.load(open(f'{B}{w}/placement.json'))['spots']:
        place[e['id']] = e
pins = json.load(open(B + 'pins/pins-final3.json'))
HOLD = {'jinhua', 'jiangshan', 'taizhou', 'xikou', 'yandang-mountains', 'longquan', 'wuyi'}   # fewer than four pinned spots: not applied until more are pinned
dests = {os.path.basename(f).split('.')[0] for f in glob.glob(B + 'dest-copy/*.final.json')} - HOLD
out, left = [], []
for sid, q in final.items():
    e = place.get(sid, {})
    dest = q.get('destination') or e.get('destination')
    p = pins.get(sid, {})
    if sid in held: left.append((sid, 'held')); continue
    if p.get('confidence') not in ('HIGH', 'MEDIUM'): left.append((sid, 'pin ' + str(p.get('confidence')))); continue
    if dest and dest not in dests: left.append((sid, f'destination {dest} has no copy')); continue
    if sid == 'mount-putuo-3':   # Fayu Temple was priced at the island gate fee: the Putuo pass
        q = {**q, 'free': True, 'needs': 'park-pass', 'parkPass': 'mount-putuo', 'costMin': None, 'costMax': None, 'costBasis': 'entry'}
    spot = {k: q[k] for k in FIELDS if q.get(k) is not None}
    spot['name'] = q['name']
    spot['currency'] = 'CNY'
    if q.get('free') is not True: spot.pop('free', None)
    if not dest:
        spot.update({'country': 'China', 'countryCode': 'CN', 'continent': 'Asia', 'timezone': 'Asia/Shanghai'})
    out.append({'id': sid, 'name': q['name'], 'action': 'spot' if dest else 'standalone', 'destination': dest,
                'coordinates': {'latitude': p['point']['lat'], 'longitude': p['point']['lon']}, 'coordinates_source': p.get('source'),
                'photo': None, 'photoless': True, 'photo_verdict': 'accept', 'spot': spot})
json.dump({'placements': out}, open(B + 'apply-placement.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'entries;', len(left), 'left out')
import collections
print(collections.Counter(r.split(' ')[0] + ' ' + (r.split(' ')[1] if r.startswith('pin') else '') for _, r in left))
print(sorted(collections.Counter(x['destination'] or 'standalone' for x in out).items()))
