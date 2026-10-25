#!/usr/bin/env python3
"""Appends the Papua New Guinea spots that passed triage to the STANDALONE_SPOTS array of src/data/spots.ts.

  python3 scripts/curation/png-apply-spots.py [--dry-run]

Inputs (curation/png/): triage.json (which spots are complete enough: pin, cost), spots-input.json (name, wiki, category,
note), quill/research-N.json (cost, visit time, ticketUrl), tiers.json (simple spots' default facts and category),
quill/bios-all.json (the drafted bios) and quill/facts-N.json (the fact-checker's verdicts: `fix` replaces the bio, `cut` drops the
spot). A spot with a bio that fails the fact-check stays out and is listed. Writes the spots with `country`, `countryCode`,
`continent` and `timezone` (Bougainville is its own time zone), and prints what was added and what was held.
"""
import glob, json, re, sys

DRY = '--dry-run' in sys.argv
tri = json.load(open('curation/png/triage.json'))
inp = {s['id']: s for s in json.load(open('curation/png/spots-input.json'))}
tiers = json.load(open('curation/png/tiers.json')); simple = {x['id']: x['facts'] for x in tiers['simple']}
bios = json.load(open('curation/png/quill/bios-all.json'))
res = {}
for f in sorted(glob.glob('curation/png/quill/research-*.json')):
    d = json.load(open(f)); d = d if isinstance(d, list) else d.get('spots', d)
    for r in d: res[r['id']] = r
verdict = {}
for f in sorted(glob.glob('curation/png/quill/facts-*.json')):
    for v in json.load(open(f)): verdict[v['id']] = v
ICON = {'beach': '🏖️', 'viewpoint': '🔭', 'landmark': '📍', 'monument': '🗿', 'religious': '⛪', 'nature': '🌿', 'hike': '🥾', 'museum': '🏛️', 'entertainment': '🎡', 'market': '🛍️', 'historic': '🏘️'}
ICON_BY_NAME = [(r'wreck|bomber', '⚓'), (r'volcano|tavurvur|garbuna|balbi|mount', '🌋'), (r'island|islands', '🏝️'), (r'cemetery|memorial|war', '🕊️'), (r'dive|reef|passage|bay', '🤿'), (r'river|lake', '🛶'), (r'museum|cultural', '🏛️'), (r'market', '🛍️'), (r'tunnel|cave', '🕳️'), (r'garden|habitat|sanctuary|wildlife', '🌴')]
J = lambda s: json.dumps(s, ensure_ascii=False)

def tz(c):
    return 'Pacific/Bougainville' if c['lng'] > 154.3 and -7.0 < c['lat'] < -5.0 else 'Pacific/Port_Moresby'

def icon(name, cat, facts):
    if facts and facts.get('category') == 'historic' and cat == 'landmark': return '🏘️'
    for pat, ic in ICON_BY_NAME:
        if re.search(pat, name, re.I): return ic
    return ICON.get(cat, '📍')

lines, held, added = [], [], []
for sid, t in tri.items():
    if not t['add']: held.append((sid, t['name'], '; '.join(t['why']))); continue
    v = verdict.get(sid)
    bio = bios.get(sid)
    if v:
        if v['verdict'] == 'cut': held.append((sid, t['name'], 'fact-check cut it: ' + '; '.join(v.get('problems', [])))); continue
        if v['verdict'] == 'fix' and v.get('fixed_bio'): bio = v['fixed_bio']
    if not bio: held.append((sid, t['name'], 'no bio')); continue
    s, r = inp[sid], res.get(sid, {})
    co = t['coordinates']
    facts = simple.get(sid)
    cat = (facts or {}).get('category') or s['category']
    if facts:
        vmin, vmax = facts['visitHoursMin'], facts['visitHoursMax']; free = True; cost = None
    else:
        vmin = r.get('visitHoursMin'); vmax = r.get('visitHoursMax')
        if vmin is None or vmax is None: vmin, vmax = (0.25, 0.5) if cat in ('viewpoint', 'landmark', 'monument') else (1, 3)
        free = bool(r.get('free')) or t['cost'] == 'assumed-free'
        cost = None if free else (r.get('costMin'), r.get('costMax'), r.get('currency'))
    wiki = s.get('wiki')
    fields = [f'id: {J(sid)}', 'country: "Papua New Guinea"', 'countryCode: "PG"', 'continent: "Oceania"', f'timezone: "{tz(co)}"', f'name: {J(s["name"])}']
    if wiki and wiki != s['name']: fields.append(f'wiki: {J(wiki)}')
    fields += [f'icon: {J(icon(s["name"], cat, facts))}', f'coordinates: {{ latitude: {co["lat"]}, longitude: {co["lng"]} }}', f'category: {J(cat)}', f'bio: {J(bio)}',
               f'visitHoursMin: {vmin}', f'visitHoursMax: {vmax}']
    if free: fields.append('free: true')
    elif cost and cost[0] is not None:
        fields += [f'costMin: {cost[0]}', f'costMax: {cost[1] if cost[1] is not None else cost[0]}']
        if cost[2] and cost[2] != 'USD': fields.append(f'currency: {J(cost[2])}')
    url = r.get('ticketUrl')
    if url and not r.get('blocked_url'): fields.append(f'ticketUrl: {J(url)}')
    lines.append('  { ' + ', '.join(fields) + ' },'); added.append(sid)

print(f'{len(added)} added, {len(held)} held')
for h in held: print('HELD', *h, sep=' | ')
if not DRY:
    p = 'src/data/spots.ts'; src = open(p).read().split('\n')
    a = next(i for i, l in enumerate(src) if l.startswith('const STANDALONE_SPOTS'))
    b = next(i for i in range(a, len(src)) if src[i] == '];')
    src[b:b] = ['  // ── Papua New Guinea ───────────────────────────────────────────────────────────────────────────────────'] + lines
    open(p, 'w').write('\n'.join(src))
    json.dump({'added': added, 'held': held}, open('curation/png/applied.json', 'w'), ensure_ascii=False, indent=1)
