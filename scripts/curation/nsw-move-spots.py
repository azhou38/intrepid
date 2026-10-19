#!/usr/bin/env python3
"""Turns the NSW standalone spots of the given destinations into spots of those destinations and removes each town's own
standalone spot (the destination replaces it). Ids never change (saved visits are keyed on them).

  python3 scripts/curation/nsw-move-spots.py <destination-id>... [--dry-run]

Reads curation/nz-rest/nsw-destinations/final-manifest.json (members, self_spots). A member line
  { id: 'x', country: "Australia", countryCode: "AU", continent: "Oceania", timezone: "Australia/Sydney", name: ...
becomes
  { id: 'x', destinationId: 'dest', name: ...
(a Lord Howe or Broken Hill zone moves to the destination's own `timezone`), and the line moves, in the brief's order, to the end
of the DESTINATION_SPOTS array."""
import json, re, sys
args = [a for a in sys.argv[1:] if not a.startswith('--')]
dry = '--dry-run' in sys.argv
man = {d['id']: d for d in json.load(open('curation/nz-rest/nsw-destinations/final-manifest.json'))['destinations']}
p = 'src/data/spots.ts'
L = open(p).read().split('\n')
idx = {}
for i, l in enumerate(L):
    m = re.match(r"\s*\{ id: '([^']+)'", l)
    if m: idx[m.group(1)] = i
end_dest = next(i for i, l in enumerate(L) if l.startswith('];') and i > 300)   # closing of DESTINATION_SPOTS
moved, removed, missing = [], [], []
add = []
kill = set()
for did in args:
    d = man[did]
    for sid in d['members']:
        i = idx.get(sid)
        if i is None: missing.append(sid); continue
        l = L[i]
        if 'destinationId' in l: continue
        l2 = re.sub(r"\{ id: '%s', country: \"[^\"]*\", countryCode: \"[^\"]*\", continent: \"[^\"]*\", timezone: \"[^\"]*\", " % re.escape(sid), "{ id: '%s', destinationId: '%s', " % (sid, did), l)
        if l2 == l: missing.append(sid + ' (unexpected line)'); continue
        add.append(l2); kill.add(i); moved.append(sid)
    for sid in d['self_spots']:
        i = idx.get(sid)
        if i is not None and i not in kill: kill.add(i); removed.append(sid)
if not dry:
    out = [l for i, l in enumerate(L) if i not in kill]
    shift = sum(1 for i in kill if i < end_dest)
    pos = end_dest - shift
    out[pos:pos] = add
    open(p, 'w').write('\n'.join(out))
print(('would move' if dry else 'moved'), len(moved), 'spots;', 'removed town spots:', removed, '; problems:', missing)
