#!/usr/bin/env python3
"""Writes skeptic.json (the proposer's list of kept places) per region from its final verdicts.json.   python3 curation/sa/mkskeptic.py <region-id>..."""
import json, sys
for r in sys.argv[1:]:
    d = f'curation/sa/region-{r}'
    v = json.load(open(f'{d}/verdicts.json'))
    out = [{'name': e['name'], 'verdict': 'keep', 'objection': e.get('reason'), 'photo_verdict': 'none', 'photo': None, 'photo_reason': 'photos are judged by Lens'} for e in v if e['verdict'] == 'keep']
    json.dump(out, open(f'{d}/skeptic.json', 'w'), indent=1, ensure_ascii=False)
    print(r, len(out), 'kept')
