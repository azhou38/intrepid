#!/usr/bin/env python3
"""Splits a region's marginal.json into balanced shards of at most 60 entries: marginal.part-<N>.json (the same entry shape).
  python3 curation/sa/shard.py <region-id>..."""
import json, math, sys
for r in sys.argv[1:]:
    d = f'curation/sa/region-{r}'
    m = json.load(open(f'{d}/marginal.json'))
    n = math.ceil(len(m) / 60)
    size = math.ceil(len(m) / n)
    for i in range(n):
        json.dump(m[i * size:(i + 1) * size], open(f'{d}/marginal.part-{i + 1}.json', 'w'), indent=1, ensure_ascii=False)
    print(r, len(m), 'entries ->', n, 'shards')
