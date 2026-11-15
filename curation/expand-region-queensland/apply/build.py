#!/usr/bin/env python3
"""Adapter: turns the Queensland run's final-dest.json / final-spots.json / placement.pinned.json into the inputs of
apply-destination.py (apply/dest/<id>.json) and apply-placement.py (apply/place-<dest>.json, apply/place-standalone.json),
and writes apply/not-applied.json (every spot left out and why) and apply/regions.json (region membership)."""
import json, os, re
B = 'curation/expand-region-queensland/'
A = B + 'apply/'
os.makedirs(A + 'dest', exist_ok=True)
fd = json.load(open(B + 'final-dest.json'))
fs = json.load(open(B + 'final-spots.json'))
pl = json.load(open(B + 'placement.pinned.json'))
PEND = set('rainbow-beach-1 whitsundays-10 townsville-1 townsville-2 townsville-3 townsville-5 townsville-6 townsville-8 townsville-9 ingham-1'.split())
ICON = {'museum': '🏛️', 'landmark': '🏛️', 'monument': '🗿', 'religious': '⛪', 'nature': '🌿', 'viewpoint': '🔭', 'hike': '🥾',
        'entertainment': '🎡', 'market': '🛍️', 'beach': '🏖️', 'historic': '🏚️'}
NAME_ICON = [('koala', '🐨'), ('wildlife', '🦘'), ('zoo', '🦘'), ('falls', '💧'), ('waterfall', '💧'), ('gorge', '💧'), ('lighthouse', '🗼'),
             ('lookout', '🔭'), ('gallery', '🖼️'), ('island', '🏝️'), ('reef', '🐠'), ('cave', '🕳️'), ('lake', '💧'), ('winery', '🍷'),
             ('dinosaur', '🦕'), ('railway', '🚂'), ('train', '🚂'), ('bridge', '🌉'), ('park', '🌳'), ('observatory', '🔭')]

def icon(name, cat):
    n = name.lower()
    if cat in ('nature', 'viewpoint', 'entertainment', 'museum', 'landmark'):
        for k, v in NAME_ICON:
            if k in n: return v
    return ICON[cat]

dests = {d['id']: d for d in pl['new_destinations']}
out_ids = set(dests)
order = ['whitsundays', 'brisbane', 'gold-coast', 'cairns', 'kgari', 'sunshine-coast', 'daintree', 'noosa', 'port-douglas', 'townsville', 'moreton-island',
         'atherton-tablelands', 'gold-coast-hinterland', 'scenic-rim', 'glass-house-mountains', 'sunshine-coast-hinterland', 'kuranda',
         'magnetic-island', 'mission-beach', 'rockhampton', 'bundaberg', 'ingham', 'cooktown', 'winton', 'gladstone']
assert set(order) == set(dests) == set(fd), set(order) ^ set(dests)
json.dump(order, open(A + 'order.json', 'w'))
for did, d in dests.items():
    c = fd[did]
    dd = {k: d[k] for k in ('id', 'name', 'country', 'countryCode', 'continent', 'timezone', 'coordinates', 'category', 'defaultZoomSpanKm', 'rank')}
    dd['timezone'] = 'Australia/Brisbane'
    for k in ('icon', 'tagline', 'description', 'whyVisit', 'highlights', 'goodToKnow', 'bestMonths', 'bestTimeBlurb', 'seasonalTags'):
        if c.get(k): dd[k] = c[k]
    dd['whySubjects'] = [{'names': s} if isinstance(s, list) else s for s in c['whySubjects']]
    json.dump({'destination': dd, 'spots': {}}, open(f'{A}dest/{did}.json', 'w'), indent=1, ensure_ascii=False)

na = []   # (id, name, reason)
groups = {}
for sid, v in fs.items():
    why = None
    cost = v.get('cost') or {}
    if sid in PEND: why = 'pending shard-10 batch (added later)'
    elif v.get('review'): why = 'review: ' + str(v.get('review_reason') or v.get('notes') or 'owner decision')
    elif not v.get('bio'): why = 'held (no bio): ' + str(v.get('notes') or v.get('held') or '')
    elif not cost.get('free') and cost.get('costMin') is None:
        why = 'cost unverified, not free: ' + '; '.join(v.get('unverified') or [])[:160]
    elif v['action'] == 'spot' and v['destination'] not in out_ids: why = 'destination not in the app'
    if why:
        na.append((sid, v['name'], why)); continue
    s = {'name': v['name'], 'category': v['category'], 'icon': icon(v['name'], v['category']), 'bio': v['bio'],
         'visitHoursMin': v['visitHoursMin'], 'visitHoursMax': v['visitHoursMax']}
    if v.get('wiki') and v['wiki'] != v['name']: s['wiki'] = v['wiki']
    if cost.get('free'): s['free'] = True
    else:
        s['costMin'] = cost['costMin']; s['costMax'] = cost.get('costMax', cost['costMin']); s['currency'] = cost.get('currency') or 'AUD'
    for k in ('costBasis', 'costPer', 'needs'):
        if cost.get(k): s[k] = cost[k]
    if v.get('ticketUrl'): s['ticketUrl'] = v['ticketUrl']
    if v['action'] == 'standalone':
        s.update(country='Australia', countryCode='AU', continent='Oceania', timezone='Australia/Brisbane')
    e = {'id': 'black-stump-blackall' if sid == 'black-stump' else sid, 'name': v['name'], 'action': v['action'], 'destination': v['destination'] if v['action'] == 'spot' else None,
         'coordinates': v['coordinates'], 'photo': None, 'photoless': True, 'spot': s}
    groups.setdefault(v['destination'] if v['action'] == 'spot' else '_standalone', []).append(e)
for g, es in groups.items():
    fn = 'place-standalone.json' if g == '_standalone' else f'place-{g}.json'
    json.dump({'placements': es}, open(A + fn, 'w'), indent=1, ensure_ascii=False)
json.dump(na, open(A + 'not-applied.json', 'w'), indent=1, ensure_ascii=False)
print({g: len(e) for g, e in groups.items()}, len(na), 'not applied')
for n in na: print(n)
