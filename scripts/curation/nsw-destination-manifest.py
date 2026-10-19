#!/usr/bin/env python3
"""Unifies the proposed destinations of every NSW region placement.json into curation/nz-rest/nsw-destinations/manifest.json:
{id, name, region, centre, span, category, rank, thin, np_exception, members: [current spot ids], self_spot: id|None, unresolved: [names]}.
Members are matched to the spots now in src/data/spots.ts by name (the ids differ from the placement's proposal ids)."""
import json, glob, re, collections
src = open('src/data/spots.ts').read()
byname = collections.defaultdict(list)
for l in src.split('\n'):
    m = re.match(r"\s*\{ id: ['\"]([^'\"]+)['\"]", l)
    if not m: continue
    n = re.search(r'\bname: (?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\')', l)
    w = re.search(r'\bwiki: (?:"([^"]*)"|\'([^\']*)\')', l)
    byname[(n.group(1) or n.group(2)).lower()].append((m.group(1), (w.group(1) or w.group(2)) if w else None, 'countryCode: "AU"' in l))
def resolve(name, hint=None):
    c = [x for x in byname.get(name.lower(), []) if x[2]]
    if len(c) > 1 and hint:
        c = [x for x in c if hint.lower() in (x[0] + ' ' + (x[1] or '')).lower()] or c
    return c[0][0] if c else None
out = []
expected = {}
for f in sorted(glob.glob('curation/nz-rest/region-nsw-*/placement.json')):
    r = f.split('/')[-2].replace('region-', '')
    d = json.load(open(f))
    pid = {}
    for k in ('spots', 'standalone_spots'):
        for e in d.get(k, []) if isinstance(d.get(k), list) else []:
            if isinstance(e, dict) and e.get('id'): pid[e['id']] = e.get('name')
    nds = d.get('new_destinations') or d.get('proposed_destinations') or []
    if r == 'nsw-outback-far-west':
        nds = d['proposed_destinations']
    expected[r] = len(nds)
    for x in nds:
        names = []
        mem = x.get('members') or x.get('spot_ids') or x.get('spots') or x.get('kept_spots') or []
        for m in mem:
            if isinstance(m, dict): names.append(m.get('name') or pid.get(m.get('id')))
            elif isinstance(m, str):
                names.append(pid.get(m) or re.sub(r'^[a-z0-9-]+-\d+\s+', '', m))
        if not mem:
            for e in (d.get('spots') or []):
                if isinstance(e, dict) and e.get('destination') == x.get('id'): names.append(e['name'])
        centre = x.get('coordinates') or x.get('centre') or {}
        out.append({'id': x['id'], 'name': x['name'], 'region': r, 'centre': centre, 'span': x.get('defaultZoomSpanKm') or x.get('proposed_defaultZoomSpanKm'),
                    'category': x.get('category') or x.get('proposed_category'), 'rank': x.get('suggested_rank') or x.get('rank') or x.get('proposed_rank') or x.get('rank_suggestion'),
                    'thin': bool(x.get('thin')), 'np_exception': bool(x.get('np_exception')),
                    'member_names': names, 'members': [resolve(n) for n in names if n], 'self_name': x.get('self_place') if isinstance(x.get('self_place'), str) else None})
# Guard (a region's destinations were once silently dropped by a wrong key): every region must yield every destination its placement lists,
# and a placement that lists none under the keys read above but has `new-destination` spots or a `new_destinations` key is an error.
import collections
got = collections.Counter(o['region'] for o in out)
for r, n in expected.items():
    if got[r] != n:
        raise SystemExit(f'{r}: placement lists {n} proposed destinations but {got[r]} were read')
for f in glob.glob('curation/nz-rest/region-nsw-*/placement.json'):
    r = f.split('/')[-2].replace('region-', ''); d = json.load(open(f))
    if r not in expected: raise SystemExit(f'{r}: placement not read')
json.dump(out, open('curation/nz-rest/nsw-destinations/manifest.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'destinations;', sum(1 for o in out if None in o['members']), 'with unresolved members;', sum(1 for o in out if not o['centre']), 'without centre')
for o in out:
    if None in o['members'] or not o['centre'] or not o['members']:
        print(' ', o['region'], o['id'], 'members', len(o['members']), 'unresolved', [n for n, m in zip(o['member_names'], o['members']) if m is None][:5], 'centre', bool(o['centre']))
