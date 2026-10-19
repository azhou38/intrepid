#!/usr/bin/env python3
"""Builds the BLIND second-judge task for an NSW region: for every slot, the candidates the second judge chooses between:
the original candidate if the first judge accepted it, plus every candidate the searcher found. The first judge's reasons are
NOT included (blind). Output: curation/nz-rest/lens-nsw/<region>.second-task.json

  python3 scripts/curation/nsw-second-task.py <region-id>
"""
import json, sys, os, glob
r = [a for a in sys.argv[1:] if not a.startswith('--')][0]
d = 'curation/nz-rest/lens-nsw'
task = json.load(open(f'{d}/{r}.task.json'))
j1 = json.load(open(f'{d}/{r}.judge-1.json'))['slots'] if os.path.exists(f'{d}/{r}.judge-1.json') else {}
cand = {}
for f in sorted(glob.glob(f'{d}/{r}.candidates*.json')):
    for k, v in json.load(open(f)).items():
        if k.startswith('spot:') and isinstance(v, list):
            cand.setdefault(k, []).extend(v)
out = []
for s in task['slots']:
    opts = []
    c = s.get('candidate')
    if c and (j1.get(s['slot']) or {}).get('decision') == 'accept':
        opts.append({'tier': 'commons', 'file_or_url': c['file'], 'page': c.get('page'), 'width': c.get('width'), 'licence': c.get('licence'), 'source': 'skeptic'})
    for x in cand.get(s['slot'], []):
        opts.append({**x, 'source': 'searcher'})
    if not cand.get(s['slot']) and '--all' not in sys.argv:
        continue   # nothing new was proposed: the first judge's accept stands (Pipeline B: a second judge sees only proposed changes)
    out.append({'slot': s['slot'], 'name': s['name'], 'coordinates': s['coordinates'], 'options': opts})
json.dump({'region': r, 'slots': out}, open(f'{d}/{r}.second-task.json', 'w'), indent=1, ensure_ascii=False)
print(r, len(out), 'slots;', sum(1 for o in out if len(o['options']) > 1), 'with a choice;', sum(1 for o in out if not o['options']), 'with nothing')
