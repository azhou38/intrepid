#!/usr/bin/env python3
"""Builds curation/nz-rest/region-<id>/apply-placement.json for an NSW region: one flat entry per Quill spot, standalone
unless the id is a numbered spot of an existing destination (sydney-NN, blue-mountains-NN). Photos come from the skeptic's
pick as CANDIDATES (photo_verdict 'candidate'): Lens judges them and sets 'accept' before apply-region.py applies them.

  python3 scripts/curation/nsw-build-apply.py <region-id>...
"""
import json, re, sys, os

for region in sys.argv[1:]:
    base = f'curation/nz-rest/region-{region}'
    final = json.load(open(f'curation/nz-rest/quill/{region}/final.json'))
    sk = {}
    if os.path.exists(f'{base}/skeptic.json'):
        s = json.load(open(f'{base}/skeptic.json'))
        for e in (s if isinstance(s, list) else s.get('entries', [])):
            sk[e['name'].lower()] = e
    out = []
    for sid, q in final['spots'].items():
        m = re.fullmatch(r'(sydney|blue-mountains)-(\d+)', sid)
        e = sk.get(q['name'].lower()) or {}
        ph = e.get('photo') if isinstance(e.get('photo'), dict) else None
        if ph and not ph.get('file'):
            ph = None
        entry = {'id': sid, 'name': q['name'], 'action': 'spot' if m else 'standalone', 'destination': m.group(1) if m else None,
                 'coordinates': q['coordinates'], 'photo': ph, 'photo_verdict': 'candidate' if ph else 'none',
                 'skeptic_photo_verdict': e.get('photo_verdict'), 'hero_crop': e.get('hero_crop')}
        out.append(entry)
    json.dump({'placements': out}, open(f'{base}/apply-placement.json', 'w'), indent=1, ensure_ascii=False)
    print(region, len(out), 'entries,', sum(1 for o in out if o['photo']), 'with a candidate photo')
