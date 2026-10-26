#!/usr/bin/env python3
"""Cuts curation/sa/plan/<region>.json into Quill shards of at most 12 spots: curation/sa/quill/sa-<region>/in-<N>.json = { destinations, spots }.
A destination's spots stay in order and together where they fit; its draft goes in the shard holding its first spot.   python3 curation/sa/mkshards.py <region>..."""
import json, os, re, sys
SIZE = 12
for r in [re.sub(r'^sa-', '', a) for a in sys.argv[1:]]:
    plan = json.load(open(f'curation/sa/plan/{r}.json'))
    byid = {s['id']: s for s in plan['spots']}
    order, placed = [], set()
    for d in plan['destinations']:
        for i in d['spots']:
            if i in byid and i not in placed: order.append(i); placed.add(i)
    order += [s['id'] for s in plan['spots'] if s['id'] not in placed]
    dest_of_first = {d['spots'][0]: d for d in plan['destinations'] if d['spots']}
    out = f'curation/sa/quill/sa-{r}'; os.makedirs(out, exist_ok=True)
    n = 0
    for k in range(0, len(order), SIZE):
        chunk = order[k:k + SIZE]; n += 1
        ds = [dest_of_first[i] for i in chunk if i in dest_of_first]
        json.dump({'destinations': ds, 'spots': [byid[i] for i in chunk]}, open(f'{out}/in-{n}.json', 'w'), indent=1, ensure_ascii=False)
    print(r, len(order), 'spots ->', n, 'shards')
