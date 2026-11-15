#!/usr/bin/env python3
"""Follow-up adapter: builds apply/place10-<dest>.json from final-spots-shard10.json, same rules as build.py."""
import json, re
B = 'curation/expand-region-queensland/'; A = B + 'apply/'
src = open(A + 'build.py').read()
ns = {}
exec(src[src.index('ICON = '):src.index('dests = ')], {}, ns)   # ICON, NAME_ICON, icon()
icon = ns['icon'] if 'icon' in ns else None
ICON, NAME_ICON = ns['ICON'], ns['NAME_ICON']
def icon(name, cat):
    n = name.lower()
    if cat in ('nature', 'viewpoint', 'entertainment', 'museum', 'landmark'):
        for k, v in NAME_ICON:
            if k in n: return v
    return ICON[cat]
fs = json.load(open(B + 'final-spots-shard10.json'))
spots_ts = open('src/data/spots.ts').read()
groups, na = {}, []
for sid, v in fs.items():
    cost = v.get('cost') or {}
    why = None
    if f"id: '{sid}'" in spots_ts: why = 'already exists'
    elif v.get('review'): why = 'review: ' + v['review']
    elif not v.get('bio'): why = 'held (no bio): ' + str(v.get('held'))
    elif not cost.get('free') and cost.get('costMin') is None:
        why = 'cost unverified, not free: ' + '; '.join(v.get('unverified') or [])[:160]
    if why: na.append((sid, v['name'], why)); continue
    c = v['coordinates']
    if sid == 'whitsundays-10': c = {'latitude': -20.269673, 'longitude': 148.838316}
    s = {'name': v['name'], 'category': v['category'], 'icon': icon(v['name'], v['category']), 'bio': v['bio'],
         'visitHoursMin': v['visitHoursMin'], 'visitHoursMax': v['visitHoursMax']}
    if v.get('wiki') and v['wiki'] != v['name']: s['wiki'] = v['wiki']
    if cost.get('free'): s['free'] = True
    else: s.update(costMin=cost['costMin'], costMax=cost.get('costMax', cost['costMin']), currency=cost.get('currency') or 'AUD')
    for k in ('costBasis', 'costPer', 'needs'):
        if cost.get(k): s[k] = cost[k]
    if v.get('ticketUrl'): s['ticketUrl'] = v['ticketUrl']
    e = {'id': sid, 'name': v['name'], 'action': v['action'], 'destination': v['destination'] if v['action'] == 'spot' else None,
         'coordinates': c, 'photo': None, 'photoless': True, 'spot': s}
    groups.setdefault(v['destination'] if v['action'] == 'spot' else '_standalone', []).append(e)
for g, es in groups.items():
    json.dump({'placements': es}, open(f'{A}place10-{g}.json', 'w'), indent=1, ensure_ascii=False)
print({g: [e['id'] for e in es] for g, es in groups.items()})
for n in na: print(n)
json.dump(na, open(A + 'not-applied-shard10.json', 'w'), indent=1, ensure_ascii=False)
