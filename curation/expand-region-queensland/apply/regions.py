#!/usr/bin/env python3
"""Adds each new destination and standalone spot to its qld-* region in scripts/coverage-regions.json.
Region = global-keeps.json's region of the place (matched by name or merged_from name); a destination takes the most common
region among its spots; anything unmatched falls back to the smallest region bbox that contains it."""
import json, glob, collections
B = 'curation/expand-region-queensland/'
A = B + 'apply/'
keeps = json.load(open(B + 'global-keeps.json'))
by_name = {}
for k in keeps:
    for n in [k['name']] + [m['name'] for m in k.get('merged_from', [])]:
        by_name[n.lower()] = 'qld-' + k['region']
R = json.load(open('scripts/coverage-regions.json'))
q = {r['id']: r for r in R['AU'] if r['id'].startswith('qld-')}
def bbox_region(lat, lon):
    c = [(abs((r['sources']['bbox'][2]-r['sources']['bbox'][0])*(r['sources']['bbox'][3]-r['sources']['bbox'][1])), r['id']) for r in q.values()
         if r['sources']['bbox'][0] <= lat <= r['sources']['bbox'][2] and r['sources']['bbox'][1] <= lon <= r['sources']['bbox'][3]]
    return min(c)[1] if c else None
dest = json.load(open(B + 'placement.pinned.json'))['new_destinations']
dreg = collections.defaultdict(collections.Counter)
stand = []
for f in glob.glob(A + 'place-*.json'):
    for e in json.load(open(f))['placements']:
        c = e['coordinates']
        reg = by_name.get(e['name'].lower()) or bbox_region(c['latitude'], c['longitude'])
        if e['action'] == 'spot': dreg[e['destination']][reg] += 1
        else: stand.append((e['id'], reg))
log = []
for d in dest:
    reg = dreg[d['id']].most_common(1)[0][0] if dreg[d['id']] else (by_name.get(d['name'].lower()) or bbox_region(d['coordinates']['latitude'], d['coordinates']['longitude']))
    if d['id'] not in q[reg]['destinations']: q[reg]['destinations'].append(d['id'])
    log.append((d['id'], reg))
for sid, reg in stand:
    if sid not in q[reg]['standalone']: q[reg]['standalone'].append(sid)
json.dump(R, open('scripts/coverage-regions.json', 'w'), indent=2, ensure_ascii=False); open('scripts/coverage-regions.json', 'a').write('\n')
print(log)
