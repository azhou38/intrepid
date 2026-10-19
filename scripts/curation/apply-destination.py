#!/usr/bin/env python3
"""Adds a NEW destination to src/data (Quill's final copy + Lens's agreed photos).

  python3 scripts/curation/apply-destination.py curation/<branch>/quill/<id>/final.json --picks picks.json [--dry-run]

final.json: { destination: { id, name, country, countryCode, timezone, continent, coordinates, category, defaultZoomSpanKm,
              rank, icon, tagline, description, whyVisit[3], highlights[3], goodToKnow[3 {icon,title,detail}], bestMonths,
              bestTimeBlurb, seasonalTags? }, spots, notes }
picks.json:  { "header": "<Commons file>", "why": ["<file>", "<file>", "<file>"] }   (files agreed by both judges)

Writes the entry into src/data/destinations.ts after the last destination of the same country (or at the end), the header
into WIKI_IMAGE_OVERRIDES keyed by the destination's name, and `whyVisitPhotos` from picks. A destination with no
accepted header is NOT added (check-destination-headers would fail and the pin would show an unrelated photo): the script
refuses and says so. Add its spots afterwards with apply-placement.py --dest <id> --overrides <final.json>.
"""
import json, re, sys

args = sys.argv[1:]
if not args or args[0].startswith('--'):
    sys.exit(__doc__)
final = json.load(open(args[0]))
d = final['destination']
picks = json.load(open(args[args.index('--picks') + 1])) if '--picks' in args else {}
dry = '--dry-run' in args

no_header = '--allow-no-header' in args   # no passing header exists in any tier: still add the destination, with NO_PHOTO (the owner is asked for one)
if (not picks.get('header') and not no_header) or len(picks.get('why', [])) != 3 or not all(picks['why']):
    sys.exit(f"refusing: {d['id']} needs an accepted header and three why-visit photos (picks.json); have {picks}")
for k in ('whyVisit', 'highlights', 'goodToKnow'):
    if len(d.get(k, [])) != 3:
        sys.exit(f'refusing: {k} must have exactly three entries')
if d['bestTimeBlurb'].count('{months}') != 1:
    sys.exit('refusing: bestTimeBlurb needs exactly one {months}')

src = open('src/data/destinations.ts').read()
if re.search(r"id: '" + re.escape(d['id']) + r"'", src):
    sys.exit(f"refusing: destination id {d['id']} already exists")

q = lambda s: json.dumps(s, ensure_ascii=False)
c = d['coordinates']
lines = [
    '  {',
    f"    id: '{d['id']}', name: {q(d['name'])}, country: {q(d['country'])}, countryCode: '{d['countryCode']}', timezone: '{d['timezone']}', defaultZoomSpanKm: {d['defaultZoomSpanKm']},",
    f"    continent: '{d['continent']}', coordinates: {{ latitude: {c['latitude']}, longitude: {c['longitude']} }},",
    f"    category: '{d['category']}', icon: {q(d['icon'])}, rank: {d['rank']},",
    f"    tagline: {q(d['tagline'])},",
    f"    description: {q(d['description'])},",
    f"    whyVisit: [{', '.join(q(x) for x in d['whyVisit'])}],",
    f"    whyVisitPhotos: [{', '.join(q(x) for x in picks['why'])}],",
    f"    highlights: [{', '.join(q(x) for x in d['highlights'])}],",
    '    goodToKnow: [',
]
for t in d['goodToKnow']:
    lines.append(f"      {{ icon: {q(t['icon'])}, title: {q(t['title'])}, detail: {q(t['detail'])} }},")
lines.append('    ],')
lines.append(f"    bestMonths: [{', '.join(str(m) for m in d['bestMonths'])}],")
lines.append(f"    bestTimeBlurb: {q(d['bestTimeBlurb'])},")
if d.get('seasonalTags'):
    tags = []
    for t in d['seasonalTags']:
        f = [f"tag: '{t['tag']}'"]
        if t.get('months'):
            f.append(f"months: [{', '.join(str(m) for m in t['months'])}]")
        if t.get('strength') is not None:
            f.append(f"strength: {t['strength']}")
        tags.append('{ ' + ', '.join(f) + ' }')
    lines.append(f"    seasonalTags: [{', '.join(tags)}],")
lines.append('  },')

L = src.split('\n')
end = len(L) - 1
while end > 0 and L[end].strip() != '];':
    end -= 1
# the last destination of this country: its closing '  },' is the line before the next '  {' of another country, or '];'
last_close = None
for i, l in enumerate(L[:end]):
    if f"countryCode: '{d['countryCode']}'" in l:
        j = i
        while L[j] != '  },':
            j += 1
        last_close = j
at = last_close + 1 if last_close is not None else end
L[at:at] = lines
if not dry:
    open('src/data/destinations.ts', 'w').write('\n'.join(L))
    p = 'src/data/imageOverrides.ts'
    s = open(p).read()
    k = q(d['name'])
    if picks.get('header'):
        v = q(picks['header'])
        pat = re.compile(r'^  ' + re.escape(k) + r': .*,$', re.M)
        if pat.search(s):
            s = pat.sub(lambda m: f'  {k}: {v},', s, 1)
        else:
            i = s.index('};', s.index('export const WIKI_IMAGE_OVERRIDES'))
            s = s[:i] + f'  {k}: {v},\n' + s[i:]
    else:
        i = s.index(']);', s.index('export const NO_PHOTO'))
        s = s[:i] + f'  {k},\n' + s[i:]
    open(p, 'w').write(s)
print(f"{'would add' if dry else 'added'} destination {d['id']} ({d['name']}) after line {at}")
