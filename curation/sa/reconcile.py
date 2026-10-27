#!/usr/bin/env python3
"""Writes curation/sa/lens/dest-K/decided.json: tie-breaks where the two blind judges chose different files and each accepted the
other's choice in its own candidate list (judge 1's choice wins); one-sided 'none' stays unresolved (grey card)."""
import glob, json
n = 0
for g in sorted(glob.glob('curation/sa/lens/dest-*/')):
    j1, j2 = (json.load(open(g + f'judge-{k}.json')) for k in (1, 2))
    dec = {}
    for k, v in j1.items():
        a, b = (v or {}).get('choice') or '', (j2.get(k) or {}).get('choice') or ''
        if not a or not b or a == b or a.startswith('none') or b.startswith('none'): continue
        v2 = {c['file']: c for c in (j2[k].get('candidates') or [])}
        v1 = {c['file']: c for c in (v.get('candidates') or [])}
        if (v2.get(a) or {}).get('verdict') == 'accept' and (v1.get(b) or {}).get('verdict') == 'accept':
            dec[k] = {'choice': a, 'reason': 'judges chose different files and each accepted the other\'s; judge 1\'s kept'}; n += 1
    json.dump(dec, open(g + 'decided.json', 'w'), indent=1)
print('tie-breaks', n)
