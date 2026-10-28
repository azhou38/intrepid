#!/usr/bin/env python3
"""Collects the photo slots that need a NEW photo into one queue file for the image searcher (Pipeline B step 2).

  python3 scripts/curation/build-search-queue.py <out.json> <region-id>... [--branch nz-rest] [--country NZ]

Sources, under curation/<branch>/ (default nz-rest, country NZ): every search slot the gather script found no candidates for
(lens/<group>/candidates.json), the first judge's rejects and "none" verdicts (lens/<group>/judge-1.json), and the spots Quill
wrote but held for lack of a photo (`held` in quill/<region>/final.json,
with their placement entry for name/destination/reason). Each queue entry: { slot, kind: "reject"|"held", name, region,
destination, what_to_show, current_file, failed_check, why, where: manifest key / override key }.
"""
import json, os, sys
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
BRANCH, COUNTRY = opt('--branch', 'nz-rest'), opt('--country', 'NZ')
out = args[0]
regions = [a for i, a in enumerate(args[1:], 1) if not a.startswith('--') and args[i - 1] not in ('--branch', '--country', '--groups')]
regdef = {x['id']: x for x in json.load(open('scripts/coverage-regions.json'))[COUNTRY]}
queue = []
for r in regions:
    for g in regdef[r]['destinations'] + (['standalone'] if regdef[r].get('standalone') else []):
        cf = f'curation/{BRANCH}/lens/{g}/candidates.json'
        if os.path.exists(cf):   # nothing found by the script: no judge, straight to the searcher
            for slot, v in json.load(open(cf)).items():
                if not slot.startswith('_') and v == []:
                    queue.append({'slot': slot, 'kind': 'empty', 'region': r, 'destination': g, 'why': 'gather script found no candidates'})
        f = f'curation/{BRANCH}/lens/{g}/judge-1.json'
        if not os.path.exists(f):
            continue
        j = json.load(open(f))
        for slot, v in j.get('slots', j).items():
            if isinstance(v, dict) and (v.get('decision') == 'reject' or str(v.get('choice') or '').startswith('none')) and not any(q['slot'] == slot for q in queue):
                queue.append({'slot': slot, 'kind': 'reject', 'region': r, 'destination': g, 'failed_check': v.get('failed_check'),
                              'why': (v.get('candidates') or [{}])[0].get('reason') if v.get('candidates') else None})
    fin = f'curation/{BRANCH}/quill/{r}/final.json'
    pl = f'curation/{BRANCH}/region-{r}/placement.json'
    if os.path.exists(fin) and os.path.exists(pl):
        final = json.load(open(fin)); place = json.load(open(pl))
        key = next(k for k in ('placements', 'places', 'spots', 'new_spots') if k in place)
        byid = {e['id']: e for e in place[key]}
        held = list(final.get('held', [])) + [e['id'] for e in place[key] if 'held' in str(e.get('status') or '') and e['id'] in final['spots'] and e['id'] not in final.get('held', [])]
        for sid in held:
            sid = sid.get('id') if isinstance(sid, dict) else sid   # newer runs list held spots as {id, reason}
            e = byid.get(sid) or {}
            q = final['spots'].get(sid) or {}
            queue.append({'slot': f'spot:{sid}', 'kind': 'held', 'region': r, 'destination': e.get('destination'),
                          'name': q.get('name') or e.get('name'), 'category': q.get('category') or e.get('category'),
                          'coordinates': q.get('coordinates') or e.get('coordinates'), 'why': e.get('status'),
                          'photo_note': (e.get('photo') or {}).get('file')})
SKIP = {'spot:gisborne-3', 'spot:gisborne-10', 'spot:ruahine-forest-park', 'spot:yeomans-track', 'spot:faraday-museum'}   # removed or held for access reasons, not photos
queue = [q for q in queue if q['slot'] not in SKIP]
json.dump(queue, open(out, 'w'), indent=1, ensure_ascii=False)
print(len(queue), 'slots ->', out)
