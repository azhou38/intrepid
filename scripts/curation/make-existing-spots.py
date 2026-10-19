#!/usr/bin/env python3
"""Writes curation/nz-rest/region-<id>/existing-spots.json: the spots already in the app that belong to a region of
scripts/coverage-regions.json (spots of its destinations plus its listed standalone spots), for the Atlas agents.

  python3 scripts/curation/make-existing-spots.py <region-id>...      (the folder is shared by every country's regions)
"""
import json, os, re, sys
cfg = json.load(open('scripts/coverage-regions.json'))
regs = {r['id']: r for k, v in cfg.items() if isinstance(v, list) for r in v}
src = open('src/data/spots.ts').read()
rows = []
for l in src.split('\n'):
    if not l.lstrip().startswith('{ id:'): continue
    m = re.search(r"\{ id: ['\"]([^'\"]+)['\"]", l); dm = re.search(r"destinationId: ['\"]([^'\"]+)['\"]", l)
    n = re.search(r"name: (?:\"([^\"]*)\"|'([^']*)')", l); c = re.search(r"latitude: (-?[\d.]+), longitude: (-?[\d.]+)", l)
    cat = re.search(r"category: '(\w+)'", l); b = re.search(r"bio: (?:\"((?:[^\"\\]|\\.)*)\"|'((?:[^'\\]|\\.)*)')", l)
    if m and c: rows.append({'id': m.group(1), 'dest': dm.group(1) if dm else None, 'name': (n.group(1) or n.group(2)) if n else '', 'category': cat.group(1) if cat else '', 'bio': (b.group(1) or b.group(2)) if b else '', 'coordinates': {'latitude': float(c.group(1)), 'longitude': float(c.group(2))}})
for rid in sys.argv[1:]:
    r = regs[rid]
    out = [x for x in rows if (x['dest'] in r['destinations']) or x['id'] in r.get('standalone', [])]
    d = f'curation/nz-rest/region-{rid}'; os.makedirs(d, exist_ok=True)
    json.dump([{k: v for k, v in x.items() if k != 'dest'} for x in out], open(f'{d}/existing-spots.json', 'w'), indent=1, ensure_ascii=False)
    print(rid, len(out))
