#!/usr/bin/env python3
"""Builds Lens task files for the SA destinations' header and why-visit photos (curation/sa/lens/<group>/task.json).

The destinations are new (not in src/data yet), so lens-triage.ts cannot build these slots: every one is `search`, with
the context the searcher needs (name, category, centre, the reason the photo must show). Spot photos are triaged later
with lens-triage.ts --region, once the spots are in src/data. Groups hold about four destinations each.
"""
import glob, json, os

# Destinations already in a group keep it (groups in work are never renumbered); new ones go into new groups.
done = {s['slot'].split(':')[1] for t in glob.glob('curation/sa/lens/dest-*/task.json') for s in json.load(open(t))['slots']}
start = 1 + max([int(t.split('dest-')[1].split('/')[0]) for t in glob.glob('curation/sa/lens/dest-*/task.json')] or [0])
groups, cur = [], []
for f in sorted(glob.glob('curation/sa/quill/sa-*/out-*.json')):
    for d in json.load(open(f)).get('destinations') or []:
        if d['destination']['id'] in done:
            continue
        cur.append((f.split('/')[3], d['destination']))
        if len(cur) == 4:
            groups.append(cur); cur = []
if cur:
    groups.append(cur)
for k, g in enumerate(groups, start):
    slots = []
    for region, d in g:
        ctx = {'destination': d['name'], 'category': d['category'], 'region': region, 'coordinates': d['coordinates'],
               'description': d.get('description')}
        slots.append({'slot': f"dest:{d['id']}:header", 'key': d['name'], 'current': None, 'status': 'search', 'flags': ['new destination'],
                      'context': {**ctx, 'need': 'header: the place itself, wide, >=1500 px, aspect 0.6-2.0 (cities and towns: a cityscape or waterfront in its setting; nature: the landscape it is known for)'}})
        for i, reason in enumerate(d.get('whyVisit') or [], 1):
            slots.append({'slot': f"dest:{d['id']}:why{i}", 'key': None, 'current': None, 'status': 'search', 'flags': ['new destination'],
                          'context': {**ctx, 'need': f'why-visit photo showing exactly this reason: "{reason}" (highlight: {(d.get("highlights") or [None]*9)[i-1]}); >=1280 px, landscape'}})
    os.makedirs(f'curation/sa/lens/dest-{k}', exist_ok=True)
    json.dump({'group': f'dest-{k}', 'slots': slots}, open(f'curation/sa/lens/dest-{k}/task.json', 'w'), indent=1, ensure_ascii=False)
    print(f'dest-{k}:', [d['id'] for _, d in g], len(slots), 'slots')
