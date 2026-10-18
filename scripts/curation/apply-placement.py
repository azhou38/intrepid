#!/usr/bin/env python3
"""Applies a region's placement.json (Atlas step 5) to src/data: its new spots and their photos.

  python3 scripts/curation/apply-placement.py curation/<branch>/region-<id>/placement.json [--dry-run] [--currency AUD]
                                              [--dest <id>] [--overrides curation/<branch>/quill/<dest>/final.json]

--dest restricts the run to the placements of one destination (use it after apply-destination.py has added that destination);
--overrides merges the copy editor's `spots` changes (bio, hours, cost, ticketUrl, …) over each placement's spot before it is written.

Adds, to src/data/spots.ts, every placement whose `action` is
  "spot"        and whose `destination` already exists in src/data/destinations.ts  → after that destination's last spot
  "standalone"                                                                      → at the end of the standalone section
and writes each one's accepted photo into WIKI_IMAGE_OVERRIDES (keyed by wiki title, else name). It skips:
  - spots of a PROPOSED destination (`spot-of-proposed-destination`, or a destination not in destinations.ts yet): they go
    in with the destination, when it is written (Quill + Lens);
  - placements flagged `status` (held: needs an external photo, no photo, …) and any entry without an accepted photo;
  - a draft that Pipeline C has not researched: `needs_research` left, placeholder hours, or no cost and not free;
  - a spot whose id is already in spots.ts or in git history (ids are never reused).
A cost in the entry gets the currency (default AUD; pass --currency). The destination and standalone fields follow
WRITING.md. Run, then: build-image-manifest.ts, tsc, audit-spot-coordinates.ts, photo-prefilter.ts. Prints what it added
and what it skipped and why.
"""
import json, re, subprocess, sys

args = sys.argv[1:]
if not args or args[0].startswith('--'):
    sys.exit(__doc__)
path = args[0]
dry = '--dry-run' in args
currency = args[args.index('--currency') + 1] if '--currency' in args else 'AUD'
only_dest = args[args.index('--dest') + 1] if '--dest' in args else None
overrides = json.load(open(args[args.index('--overrides') + 1])).get('spots', {}) if '--overrides' in args else {}

place = json.load(open(path))
spots_src = open('src/data/spots.ts').read()
dest_src = open('src/data/destinations.ts').read()
dest_ids = set(re.findall(r"^\s*id: '([a-z0-9-]+)', name: ", dest_src, re.M))
ids_now = set(re.findall(r"id: ['\"]([^'\"]+)['\"]", spots_src))
hist = subprocess.run("git log -p -- src/data/spots.ts | grep -o \"id: ['\\\"][a-z0-9-]*['\\\"]\"", shell=True, capture_output=True, text=True).stdout
ids_ever = ids_now | set(re.findall(r"id: ['\"]([^'\"]+)['\"]", hist))

q = lambda s: json.dumps(s, ensure_ascii=False)


def spot_line(sid, dest, e):
    s = e['spot']
    c = e['coordinates']
    f = [f"id: '{sid}'"]
    if dest:
        f.append(f"destinationId: '{dest}'")
    else:
        f.append(f"country: {q(s['country'])}, countryCode: {q(s['countryCode'])}, continent: {q(s['continent'])}, timezone: {q(s['timezone'])}")
    f.append(f"name: {q(s['name'])}")
    if s.get('wiki'):
        f.append(f"wiki: {q(s['wiki'])}")
    f.append(f"icon: {q(s['icon'])}")
    f.append(f"coordinates: {{ latitude: {c['latitude']}, longitude: {c['longitude']} }}")
    f.append(f"category: '{s['category']}'")
    f.append(f"bio: {q(s['bio'])}")
    f.append(f"hours: {q(s['hours'])}")
    f.append(f"visitHoursMin: {s['visitHoursMin']}, visitHoursMax: {s['visitHoursMax']}")
    if s.get('free'):
        f.append('free: true')
    elif s.get('costMin') is not None:
        f.append(f"costMin: {s['costMin']}, costMax: {s.get('costMax', s['costMin'])}, currency: '{s.get('currency') or currency}'")
    if s.get('closedDays'):
        f.append(f"closedDays: [{', '.join(str(d) for d in s['closedDays'])}]")
    if s.get('ticketUrl'):
        f.append(f"ticketUrl: {q(s['ticketUrl'])}")
    return '  { ' + ', '.join(f) + ' },'


def set_hero_focus(key, focus):
    """A judge's `hero_crop: {x, y}` (where the subject sits in the photo; IMAGES.md "Keeping the subject in the crop")
    → PHOTO_SUBJECT in imageOverrides.ts."""
    p = 'src/data/imageOverrides.ts'
    s = open(p).read()
    k = q(key)
    parts = ', '.join(f'{a}: {focus[a]}' for a in ('x', 'y') if focus.get(a) is not None)
    line = f'  {k}: {{ {parts} }},'
    pat = re.compile(r'^  ' + re.escape(k) + r': \{.*\},$', re.M)
    anchor = s.index('export const PHOTO_SUBJECT')
    end = s.index('};', anchor)
    block = s[anchor:end]
    if pat.search(block):
        block = pat.sub(lambda m: line, block, 1)
    else:
        block += line + '\n'
    open(p, 'w').write(s[:anchor] + block + s[end:])


def set_override(key, file):
    p = 'src/data/imageOverrides.ts'
    s = open(p).read()
    k, v = q(key), q(file)
    pat = re.compile(r'^  ' + re.escape(k) + r': .*,$', re.M)
    if pat.search(s):
        s = pat.sub(lambda m: f'  {k}: {v},', s, 1)
    else:
        i = s.index('};', s.index('export const WIKI_IMAGE_OVERRIDES'))
        s = s[:i] + f'  {k}: {v},\n' + s[i:]
    open(p, 'w').write(s)


added, skipped = [], []
by_dest = {}
standalone = []
for e in place['placements']:
    act, dest, sid = e.get('action'), e.get('destination'), e.get('id')
    name = e.get('name')
    if only_dest and dest != only_dest:
        continue
    # Some placement files carry the finished record as `entry` (with id/destinationId/coordinates) rather than `spot`.
    if 'spot' not in e and 'entry' in e:
        e['spot'] = {k: v for k, v in e['entry'].items() if k not in ('id', 'destinationId', 'coordinates')}
        e.setdefault('coordinates', e['entry'].get('coordinates'))
    if sid in overrides and 'spot' in e:
        e['spot'] = {**e['spot'], **overrides[sid]}
        if e['spot'].get('free') is False:
            e['spot'].pop('free')
        for k in [k for k, v in e['spot'].items() if v is None]:
            e['spot'].pop(k)
    if act not in ('spot', 'standalone'):
        if act != 'new-destination':
            skipped.append((name, f'action {act}: goes in with its destination'))
        continue
    if e.get('status'):
        skipped.append((name, e['status'])); continue
    if act == 'spot' and dest not in dest_ids:
        skipped.append((name, f'destination {dest} is not in the app yet')); continue
    if not e.get('photo') or e.get('photo_verdict') not in (None, 'accept'):
        skipped.append((name, 'no accepted photo')); continue
    if sid in ids_now:
        skipped.append((name, f'id {sid} already in spots.ts')); continue
    if sid in ids_ever:
        skipped.append((name, f'id {sid} was used before (git history)')); continue
    if 'spot' not in e:
        skipped.append((name, 'no full spot entry')); continue
    # A placement entry is a draft until Pipeline C has researched it (PIPELINES.md): no hours placeholder, a cost or
    # `free`, and a ticketUrl decision. Sea Life Sydney went in with none of these.
    sp = e['spot']
    gaps = list(e.get('needs_research') or [])
    if not sp.get('hours') or 'check the operator' in str(sp.get('hours')).lower():
        gaps.append('hours')
    if not sp.get('free') and sp.get('costMin') is None:
        gaps.append('cost')
    if gaps:
        skipped.append((name, f"not researched yet ({', '.join(sorted(set(gaps)))}): run Pipeline C, or --overrides with its final.json")); continue
    (standalone if act == 'standalone' else by_dest.setdefault(dest, [])).append(e)

lines_out = open('src/data/spots.ts').read().split('\n')


def insert_after(pred, new_lines):
    hits = [i for i, l in enumerate(lines_out) if pred(l)]
    if hits:
        idx = hits[-1]
    else:
        # A destination with no spots yet: put its block just above the standalone section (or the closing bracket).
        marks = [i for i, l in enumerate(lines_out) if 'Standalone spots' in l]
        idx = (marks[0] - 1) if marks else max(i for i, l in enumerate(lines_out) if l.strip() == '];') - 1
    lines_out[idx + 1:idx + 1] = new_lines


for dest, es in by_dest.items():
    es.sort(key=lambda e: int(e['id'].rsplit('-', 1)[-1]) if e['id'].rsplit('-', 1)[-1].isdigit() else 10**6)
    insert_after(lambda l, d=dest: f"destinationId: '{d}'" in l and l.lstrip().startswith('{ id:'), [spot_line(e['id'], dest, e) for e in es])
    added += [(e['id'], e['name']) for e in es]
if standalone:
    insert_after(lambda l: l.lstrip().startswith('{ id:') and 'country:' in l and 'destinationId' not in l, [spot_line(e['id'], None, e) for e in standalone])
    added += [(e['id'], e['name']) for e in standalone]

if not dry:
    open('src/data/spots.ts', 'w').write('\n'.join(lines_out))
    for e in [x for es in by_dest.values() for x in es] + standalone:
        set_override(e['spot'].get('wiki') or e['spot']['name'], e['photo']['file'])
        hc = e['photo'].get('hero_crop')
        if isinstance(hc, dict):
            set_hero_focus(e['spot'].get('wiki') or e['spot']['name'], hc)

print(f"{'would add' if dry else 'added'} {len(added)} spots; skipped {len(skipped)}")
for n, why in skipped:
    print(f'  skipped {n}: {why}')
