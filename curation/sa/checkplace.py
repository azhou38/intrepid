#!/usr/bin/env python3
"""Checks each region's placement.json: every kept place is placed, merged or assigned elsewhere exactly once; destinations clear the spot bar.
  python3 curation/sa/checkplace.py <region-id>..."""
import json, re, sys
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', re.sub(r'\([^)]*\)', '', str(s).lower().replace("'", ''))).strip()
def names(x):
    if isinstance(x, str): return [x]
    if isinstance(x, dict): return [str(x[k]) for k in ('name', 'from', 'merged', 'candidate', 'place') if k in x and isinstance(x[k], str)]
    return []
for r in sys.argv[1:]:
    d = f'curation/sa/region-{r}'
    try: p = json.load(open(f'{d}/placement.json'))
    except Exception as e: print(r, 'NO PLACEMENT', e); continue
    kept = [e['name'] for e in json.load(open(f'{d}/skeptic.json'))]
    placed = {}
    for key in ('spots', 'standalone'):
        for e in p.get(key, []): placed.setdefault(norm(e['name']), []).append(key)
    for key in ('merged', 'duplicates_elsewhere'):
        for e in p.get(key, []):
            for n in names(e): placed.setdefault(norm(n), []).append(key)
            if isinstance(e, dict):
                for v in e.values():
                    if isinstance(v, str) and len(v) < 90: placed.setdefault(norm(v), []).append(key + '*')
    miss = [n for n in kept if norm(n) not in placed]
    dup = [(n, placed[norm(n)]) for n in kept if sum(1 for t in placed.get(norm(n), []) if not t.endswith('*')) > 1]
    dests = p.get('new_destinations') or p.get('proposed_new_destinations') or []
    ids = [s.get('id') for s in p.get('spots', []) + p.get('standalone', [])]
    didup = sorted({i for i in ids if i and ids.count(i) > 1})
    print(f"{r}: {len(kept)} kept; {len(p.get('spots', []))} spots + {len(p.get('standalone', []))} standalone placed, {len(p.get('merged', []))} merged, {len(p.get('duplicates_elsewhere', []))} elsewhere, {len(p.get('review', []))} review; {len(dests)} destinations")
    print('   missing:', miss[:15] if miss else 'none', '| placed twice:', dup[:6] if dup else 'none', '| duplicate ids:', didup or 'none')
    per = {}
    for s in p.get('spots', []): per[s.get('destination')] = per.get(s.get('destination'), 0) + 1
    for dd in dests:
        n = per.get(dd['id'], 0)
        flag = '' if n >= 4 or dd.get('rank', 9) <= 2 else '  <-- under the four-spot bar'
        print(f"   dest {dd['id']}: rank {dd.get('rank')}, {n} spots, span {dd.get('defaultZoomSpanKm')} km{flag}")
    orphan = [k for k in per if k and k not in {x['id'] for x in dests}]
    if orphan: print('   spots under unknown destinations:', orphan)
