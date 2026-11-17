#!/usr/bin/env python3
"""Adds the places a coverage-judge found missing (judged.json entries with added_by_judge) to the region's candidates.json,
verdicts.json and skeptic.json, which merge-verdicts.ts builds from candidates.json alone. Run it after merge-verdicts.ts.

  python3 scripts/curation/append-judge-added.py <region-dir> [...]
"""
import json, sys, os
for d in sys.argv[1:]:
    rd = lambda f, dflt=None: json.load(open(os.path.join(d, f))) if os.path.exists(os.path.join(d, f)) else dflt
    judged, cands, verd, sk = rd('judged.json', []), rd('candidates.json', []), rd('verdicts.json', []), rd('skeptic.json', [])
    have = {c['name'] for c in cands}
    n = 0
    for j in judged:
        if not j.get('added_by_judge') or j['name'] in have: continue
        src = j.get('counted_source') or j.get('source') or j.get('sources')
        srcs = [src] if isinstance(src, str) else list(src or [])
        cands.append({'name': j['name'], 'wiki': j.get('wiki', j['name']), 'coordinates': j.get('coordinates'),
                      'coordinates_source': j.get('coordinates_source'), 'views': None, 'counted_sources': srcs, 'other_sources': [],
                      'note': j['reason'], 'added_by_judge': True})
        verd.append({'name': j['name'], 'existing': False, 'spot_id': None, 'verdict': j['verdict'], 'reason': j['reason'],
                     'decided_by': 'judge', 'views': None, 'counted_sources': srcs})
        if j['verdict'] != 'reject':
            sk.append({'name': j['name'], 'verdict': j['verdict'], 'objection': j.get('objection'), 'photo_verdict': 'none', 'photo': None,
                       'photo_reason': 'photos are judged by Lens'})
        n += 1
    for f, v in (('candidates.json', cands), ('verdicts.json', verd), ('skeptic.json', sk)):
        json.dump(v, open(os.path.join(d, f), 'w'), indent=1, ensure_ascii=False); open(os.path.join(d, f), 'a').write('\n')
    print(d, 'added', n)
