#!/usr/bin/env python3
"""Adds a NEW destination to src/data (Quill's final copy + Lens's agreed photos).

  python3 scripts/curation/apply-destination.py curation/<branch>/quill/<id>/final.json --picks picks.json [--dry-run]

final.json: { destination: { id, name, country, countryCode, timezone, continent, coordinates, category, defaultZoomSpanKm,
              rank, icon, tagline, description, whyVisit[2-4 by popularity], highlights[one per reason], goodToKnow[2-3 {icon,title,detail}, by popularity], bestMonths,
              bestTimeBlurb, seasonalTags? }, spots, notes }
picks.json:  { "header": "<Commons file>", "why": ["<file>", "<file>", "<file>"] }   (files agreed by both judges; with
             --allow-missing-why a reason with no photo in any tier may be "" or null: it shows as a grey card)

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
# A strong reason with no honest photo in any tier keeps its wording and gets a grey card (an empty slot, "" in whyVisitPhotos)
# rather than being reworded away from the destination's real draw; the owner is asked for a photo (IMAGES.md, "Photos still missing").
missing_why = '--allow-missing-why' in args
n_why = len(d.get('whyVisit', []))
if not 2 <= n_why <= 4:
    sys.exit(f'refusing: whyVisit must have two to four reasons (4 for the most popular, 3 average, 2 less popular); have {n_why}')
picks['why'] = [w or '' for w in picks.get('why', [])]
if (not picks.get('header') and not no_header) or len(picks['why']) != n_why or (not all(picks['why']) and not missing_why):
    sys.exit(f"refusing: {d['id']} needs an accepted header and one why-visit photo per reason ({n_why}) (picks.json; pass --allow-missing-why to leave a grey card); have {picks}")
for i, w in enumerate(picks['why'], 1):
    if not w:
        print(f'why-visit photo missing: dest:{d["id"]}:why{i} ("{d["whyVisit"][i - 1]}"): a grey card until the owner supplies one')
if len(d.get('highlights', [])) != n_why:
    sys.exit(f'refusing: highlights must have one entry per reason ({n_why})')
if not 2 <= len(d.get('goodToKnow', [])) <= 3 or any(len(t.get('detail', '')) > 160 for t in d.get('goodToKnow', [])):
    sys.exit('refusing: goodToKnow must have two or three entries (3 for rank 1-3, 2 for rank 4-5), each detail 160 characters or fewer')
import subprocess as _sp
_fit = _sp.run(['python3', 'scripts/curation/tagline-fit.py', '--text', d.get('tagline', '')], capture_output=True, text=True)
if _fit.returncode != 0:
    sys.exit(f"refusing: the tagline must fill exactly two lines of the header (WRITING.md); tagline-fit.py says {_fit.stdout.splitlines()[0] if _fit.stdout else _fit.stderr}")
if d['bestTimeBlurb'].count('{months}') != 1:
    sys.exit('refusing: bestTimeBlurb needs exactly one {months}')
_fit = _sp.run(['python3', 'scripts/curation/blurb-fit.py', '--text', d['bestTimeBlurb'], '--months', ','.join(str(m) for m in d.get('bestMonths', []))], capture_output=True, text=True)
if _fit.returncode != 0:
    sys.exit(f"refusing: the When to Visit sentence must fill two or three lines of its card (WRITING.md); blurb-fit.py says {_fit.stdout.splitlines()[0] if _fit.stdout else _fit.stderr}")

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
