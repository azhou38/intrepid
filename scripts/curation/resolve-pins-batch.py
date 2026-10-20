#!/usr/bin/env python3
"""Runs resolve-pin.py for every spot of a spots-input.json that has a rough point, shard by shard, writing pins.<shard>.json as it goes.

  python3 scripts/curation/resolve-pins-batch.py <spots-input.json> <out-prefix> <shard> <nshards>

Each result is { id, confidence, point, source, candidates } as resolve-pin.py --json prints it (or { id, error }). Spots with no
coordinates are skipped (nothing to hint with): the caller lists them as pin_needed. Resumable: ids already in the output are kept.
"""
import json, os, subprocess, sys
src, prefix, shard, n = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
spots = [s for s in json.load(open(src)) if s.get('coordinates')]
out = f'{prefix}.{shard}.json'
done = json.load(open(out)) if os.path.exists(out) else {}
for i, s in enumerate(spots):
    if i % n != shard or s['id'] in done: continue
    c = s['coordinates']
    cmd = ['python3', 'scripts/curation/resolve-pin.py', '--name', s['name'], '--category', s['category'], '--lat', str(c['lat']), '--lon', str(c['lng']), '--json']
    if s.get('wiki'): cmd += ['--wiki', s['wiki']]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
        try: done[s['id']] = json.loads(r.stdout)
        except Exception: done[s['id']] = {'error': (r.stdout + r.stderr)[-300:]}
    except subprocess.TimeoutExpired:
        done[s['id']] = {'error': 'timeout'}
    json.dump(done, open(out, 'w'), indent=1, ensure_ascii=False)
print(f'shard {shard}: {len(done)} done')
