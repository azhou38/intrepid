#!/usr/bin/env python3
"""Builds <evidence>/region-<id>/apply-placement.json for a region: one flat entry per Quill spot (from
curation/*/quill/<id>/final.json), standalone unless its id is a numbered spot of an existing destination (sydney-NN,
blue-mountains-NN: any destination in src/data/destinations.ts). Photos come from the skeptic's pick as CANDIDATES
(photo_verdict 'candidate'): Lens judges them and sets 'accept' before apply-region.py applies them.

  python3 scripts/curation/build-apply-placement.py <region-id>... [--evidence curation/<folder>]

Works for any region of any country; the evidence folder is the one holding region-<id>/ (curation/*/region-<id>/), as in
apply-region.py.
"""
import glob, json, os, re, sys

args = sys.argv[1:]
evid = args[args.index('--evidence') + 1].rstrip('/') if '--evidence' in args else None
regions = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--evidence')]
if not regions:
    sys.exit(__doc__)
dest_ids = set(re.findall(r"^\s*id: '([a-z0-9-]+)', name: ", open('src/data/destinations.ts').read(), re.M))

for region in regions:
    if evid:
        base = f'{evid}/region-{region}'
    else:
        found = sorted(os.path.dirname(f) for f in glob.glob(f'curation/*/region-{region}/'.rstrip('/') + '/placement.json'))
        if len(found) != 1:
            sys.exit(f'region {region}: {len(found)} evidence folders found ({", ".join(found) or "none"}); pass --evidence curation/<folder>')
        base = found[0]
    final = json.load(open(f'{os.path.dirname(base)}/quill/{region}/final.json'))
    sk = {}
    if os.path.exists(f'{base}/skeptic.json'):
        s = json.load(open(f'{base}/skeptic.json'))
        for e in (s if isinstance(s, list) else s.get('entries', [])):
            sk[e['name'].lower()] = e
    out = []
    for sid, q in final['spots'].items():
        m = re.fullmatch(r'([a-z0-9-]+)-(\d+)', sid)
        dest = m.group(1) if m and m.group(1) in dest_ids else None
        e = sk.get(q['name'].lower()) or {}
        ph = e.get('photo') if isinstance(e.get('photo'), dict) else None
        if ph and not ph.get('file'):
            ph = None
        entry = {'id': sid, 'name': q['name'], 'action': 'spot' if dest else 'standalone', 'destination': dest,
                 'coordinates': q['coordinates'], 'photo': ph, 'photo_verdict': 'candidate' if ph else 'none',
                 'skeptic_photo_verdict': e.get('photo_verdict'), 'hero_crop': e.get('hero_crop')}
        out.append(entry)
    json.dump({'placements': out}, open(f'{base}/apply-placement.json', 'w'), indent=1, ensure_ascii=False)
    print(region, len(out), 'entries,', sum(1 for o in out if o['photo']), 'with a candidate photo')
