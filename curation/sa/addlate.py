#!/usr/bin/env python3
"""Adds a region's late arrivals (resolved.part-9.json) to its candidates.json and verdicts.json.  python3 curation/sa/addlate.py <region-id> [--rename "Old=New"]...
A late arrival whose (parenthetical-stripped) name matches an existing candidate is a duplicate: the same verdict is a no-op, a conflicting one sends the
existing entry to review with both reasons; a late keep of a name already kept is recorded as a duplicate reject."""
import json, re, sys
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', re.sub(r'\([^)]*\)', '', s.lower().replace("'", '').replace('adelaide motorsport park', 'the bend motorsport park'))).strip()
r = sys.argv[1]; d = f'curation/sa/region-sa-{r}'
ren = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
cands = json.load(open(f'{d}/candidates.json')); ver = json.load(open(f'{d}/verdicts.json'))
late = json.load(open(f'{d}/resolved.part-9.json')); src = {e['name']: e for e in json.load(open(f'{d}/resolve-in.part-9.json'))}
byn = {norm(c['name']): c for c in cands}; vby = {norm(e['name']): e for e in ver}
for e in late:
    k = norm(e['name']); name = ren.get(e['name'], e['name'])
    if k in byn:
        old = vby[k]
        if old['verdict'] == 'keep' and e['verdict'] == 'keep':
            print('duplicate (already kept):', e['name'], '->', old['name'])
        elif old['verdict'] != e['verdict']:
            old['reason'] = f"two judges split: {old['verdict']} ({old['reason'][:120]}) vs {e['verdict']} ({e['reason'][:120]})"; old['verdict'] = 'review'
            print('conflict -> review:', old['name'])
        continue
    if re.sub(r'\([^)]*\)', '', e['name']).strip().lower() != e['name'].lower() and norm(e['name']) in vby: pass
    c = dict(src[e['name']]['candidate']); c['name'] = name; cands.append(c)
    ver.append({'name': name, 'existing': False, 'spot_id': None, 'verdict': e['verdict'], 'reason': e['reason'], 'decided_by': 'resolver (late arrival)', 'views': c.get('views'), 'counted_sources': c.get('counted_sources'), 'resolver_source': e.get('source')})
    print('added', name, e['verdict'])
json.dump(cands, open(f'{d}/candidates.json', 'w'), indent=1, ensure_ascii=False); json.dump(ver, open(f'{d}/verdicts.json', 'w'), indent=1, ensure_ascii=False)
