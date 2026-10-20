#!/usr/bin/env python3
"""Applies the Tasmania master list (curation/tas/master.json + quill/research-*.json + dest/out-*.json) to src/data.
  python3 scripts/curation/tas-apply.py [--dry-run]
Destination spots go to the end of DESTINATION_SPOTS, standalone ones to the end of STANDALONE_SPOTS, destinations to the end of
DESTINATIONS. Header and why-visit photos are placeholders ("ext-<id>.jpg") until the photo run replaces them."""
import glob, json, math, re, sys
DRY = '--dry-run' in sys.argv
DEST_ONLY = '--dest-only' in sys.argv
J = lambda s: json.dumps(s, ensure_ascii=False)
m = json.load(open('curation/tas/master.json'))
R = {}
for f in sorted(glob.glob('curation/tas/quill/research-*.json')):
    d = json.load(open(f)); d = d if isinstance(d, list) else d.get('spots', d)
    for r in d: R[r['id']] = r
DEST = {}
for g in (1, 2, 3):
    for x in json.load(open(f'curation/tas/dest/final-{g}.json')): DEST[x['id']] = x
DIN = {}
for g in (1, 2, 3):
    for x in json.load(open(f'curation/tas/dest/in-{g}.json')): DIN[x['id']] = x
# Held out (reasons in the report): no pin / duplicate / not a walk-in stop / state unconfirmed / marginal.
DROP = {'tasman-peninsula-6', 'devonport-4', 'devonport-7', 'little-blue-lake', 'spring-beach-tasmania', 'wynyard-6', 'hobart-20'}
DROP_NAMES = {'Arthur-Pieman Conservation Area'}
ICON_FIX = {}
CATEGORY_FIX = {'Echo Point': 'nature'}
rows = []
for o in m['spots'] + m['standalone']:
    if o['id'] in DROP or o['name'] in DROP_NAMES: continue
    r = R[o['id']]
    rows.append((o, r))
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    return 2 * 6371 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
lines_d, lines_s, problems = [], [], []
for o, r in rows:
    c = r['coordinates']
    if not c or c.get('lat') is None: problems.append(('no pin', o['id'])); continue
    name = r['name']; wiki = o.get('wiki')
    cat = CATEGORY_FIX.get(name) or o.get('category') or 'landmark'
    f = [f'id: {J(o["id"])}']
    if o.get('destination'): f.append(f'destinationId: {J(o["destination"])}')
    else: f += ['country: "Australia"', 'countryCode: "AU"', 'continent: "Oceania"', 'timezone: "Australia/Hobart"']
    f.append(f'name: {J(name)}')
    if wiki and wiki != name: f.append(f'wiki: {J(wiki)}')
    f += [f'icon: {J(o.get("icon") or "📍")}', f'coordinates: {{ latitude: {c["lat"]}, longitude: {c["lng"]} }}', f'category: {J(cat)}', f'bio: {J(r["bio"])}', f'hours: {J(r["hours"])}']
    if r.get('closedDays'): f.append(f'closedDays: {J(r["closedDays"])}')
    f += [f'visitHoursMin: {r["visitHoursMin"]}', f'visitHoursMax: {r["visitHoursMax"]}']
    if r.get('free'): f.append('free: true')
    elif r.get('costMin') is not None:
        f += [f'costMin: {r["costMin"]}', f'costMax: {r["costMax"] if r.get("costMax") is not None else r["costMin"]}', 'currency: "AUD"']
    else: problems.append(('no cost', o['id']))
    if r.get('ticketUrl'): f.append(f'ticketUrl: {J(r["ticketUrl"])}')
    (lines_d if o.get('destination') else lines_s).append('  { ' + ', '.join(f) + ' },')
# destinations
dl = []; ov = []
for did, x in DEST.items():
    i = DIN[did]; sp = [(o, R[o['id']]) for o, _ in rows if o.get('destination') == did]
    cc = i['coordinates']; ctr = (cc.get('lat', cc.get('latitude')), cc.get('lng', cc.get('longitude'))); span = i['defaultZoomSpanKm']
    far = max(hav(ctr, (r['coordinates']['lat'], r['coordinates']['lng'])) for o, r in sp if r['coordinates'].get('lat') is not None)
    if far > 0.75 * span: span2 = int(math.ceil(far / 0.7 / 5) * 5); problems.append(('span', did, f'{span} -> {span2} (farthest {far:.0f} km)')); span = span2
    f = [f'id: {J(did)}', f'name: {J(i["name"])}', 'country: "Australia"', 'countryCode: "AU"', 'timezone: "Australia/Hobart"', f'defaultZoomSpanKm: {span}']
    body = ['    ' + ', '.join(f) + ',',
            f'    continent: "Oceania", coordinates: {{ latitude: {ctr[0]}, longitude: {ctr[1]} }},',
            f'    category: {J(i["category"])}, icon: {J(x["icon"])}, rank: {i["rank"]},',
            f'    tagline: {J(x["tagline"])},', f'    description: {J(x["description"])},',
            f'    whyVisit: {J(x["whyVisit"])},',
            f'    whyVisitPhotos: {J([f"ext-{did}-{n+1}.jpg" for n in range(len(x["whyVisit"]))])},',
            f'    highlights: {J(x["highlights"])},', '    goodToKnow: [']
    for t in x['goodToKnow']: body.append(f'      {{ icon: {J(t["icon"])}, title: {J(t["title"])}, detail: {J(t["detail"])} }},')
    body += ['    ],', f'    bestMonths: {J(x["bestMonths"])},', f'    bestTimeBlurb: {J(x["bestTimeBlurb"])},']
    dl.append('  {\n' + '\n'.join(body) + '\n  },')
    ov.append(f'  {J(i["name"])}: "ext-{did}.jpg",')
print(len(lines_d), 'destination spots,', len(lines_s), 'standalone,', len(dl), 'destinations'); print(problems)
if DRY: sys.exit()
if not DEST_ONLY:
    sp = open('src/data/spots.ts').read().split('\n')
    a = next(i for i, l in enumerate(sp) if l.startswith('const DESTINATION_SPOTS')); b = next(i for i in range(a, len(sp)) if sp[i] == '];')
    sp[b:b] = ['  // ── Tasmania ───────────────────────────────────────────────────────────────────────────────────────────'] + lines_d
    a = next(i for i, l in enumerate(sp) if l.startswith('const STANDALONE_SPOTS')); b = next(i for i in range(a, len(sp)) if sp[i] == '];')
    sp[b:b] = ['  // ── Tasmania ───────────────────────────────────────────────────────────────────────────────────────────'] + lines_s
    open('src/data/spots.ts', 'w').write('\n'.join(sp))
ds = open('src/data/destinations.ts').read().rstrip('\n')
assert ds.endswith('];'); ds = ds[:-2] + '  // Tasmania\n' + '\n'.join(dl) + '\n];\n'
open('src/data/destinations.ts', 'w').write(ds)
o = open('src/data/imageOverrides.ts').read(); a = o.index('export const WIKI_IMAGE_OVERRIDES'); b = o.index('\n};', a)
o = o[:b] + '\n  // Tasmania destination headers: placeholders until the photo run\n' + '\n'.join(ov) + o[b:]
open('src/data/imageOverrides.ts', 'w').write(o)
