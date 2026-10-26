#!/usr/bin/env python3
"""Merges the SA Quill shards (curation/sa/quill/<region>/out-*.json) into the files the apply scripts read, and checks them.

  python3 curation/sa/merge_quill.py [--write]

Per region writes curation/sa/quill/sa-<region>/final.json ({spots, existing_fixes, held, notes}) and dest-<id>.final.json.
Applies the apply-stage decisions in curation/sa/decisions.md (holds, merges, renames, park passes, the Softfoot move),
takes each pin from the Quill source or the serial pin pass (curation/sa/pins.json: HIGH or MEDIUM wins over a provisional
hint; LOW is kept only as a flagged weak pin), widens a destination's span to hold its spots (never narrows) and checks costs,
pins and the 25 m rule. Collects every shard's unverified / needs_browser / notes into curation/sa/quill/all-notes.json.
"""
import glob, json, math, os, re, sys

WRITE = '--write' in sys.argv
REG = ['adelaide', 'barossa-clare', 'eyre', 'fleurieu', 'flinders', 'kangaroo-island', 'limestone-coast', 'murray-coorong', 'outback', 'yorke']

# ---- decisions -----------------------------------------------------------------------------------------------------
HOLD = {  # id -> reason (closed, unfinished or no public access; each listed in the report with what unblocks it)
    'adelaide-15': 'Migration Museum: closed from 1 July 2026 for 18-24 months. Unblocks on reopening.',
    'adelaide-16': 'Tandanya: closed, relaunch planned for 2027. Unblocks on reopening.',
    'adelaide-62': 'Classic Jets Fighter Museum: possibly closed, no price, no working site. Unblocks on a source confirming it is open and its price.',
    'adelaide-51': 'Adelaide Holocaust Museum: closed for re-curation until December 2026. Unblocks on reopening.',
    'adelaide-52': 'Army Museum of South Australia: to be relocated to a venue not yet chosen. Unblocks when a source says where and when it opens.',
    'adelaide-53': 'Bay Discovery Centre: no cost found (council page behind a bot wall). Unblocks on a browser check of its price.',
    'goolwa-10': 'Goolwa Motor Museum: listed permanently closed, no official site. Unblocks on a browser check that it is open.',
    'copper-coast-6': 'Wheal Hughes Copper Mine: tourists can no longer go underground. Unblocks on a source confirming public access.',
    'yankalilla-8': 'Talisker Conservation Park: closed until further notice after a fire. Unblocks on reopening.',
    'yunta': 'Yunta: its only draw is the annual Picnic Races, an event. Unblocks on a source naming a permanent sight.',
    'jamestown-railway-station-museum': 'Jamestown Railway Station Museum: no cost or official site found. Unblocks on a price or source.',
    'southern-flinders-ranges-1': 'Gladstone Gaol: closed since June 2022, reopening announced for late 2026; no cost. Unblocks on reopening and a price.',
}
MERGE = {  # dropped id -> kept id
    'riverland-6': 'riverland-2',  # Katarapko into Murray River National Park
    'coorong-national-park-10': 'coorong-national-park-11',  # Raukkan Church into Raukkan
    'adelaide-hills-20': 'adelaide-hills description',  # Gumeracha is a town wrapper
}
HOLD.update({k: 'No pin found in OpenStreetMap, Wikipedia or Commons; unblocks on the managing body\'s map or street address.' for k in
    ['adelaide-55', 'streaky-bay-7', 'ikara-flinders-ranges-19', 'caernarvon-track', 'kangaroo-island-18', 'murray-bridge-10', 'mannum-5',
     'coorong-national-park-8', 'coorong-national-park-9', 'riverland-10', 'karoonda-pioneer-park', 'tauragat-hill', 'coober-pedy-7',
     'investigator-strait-shipwreck-trail', 'streaky-bay-18']})
HOLD.update({k: 'No cost found (and not known to be free); unblocks on a price or a source saying it is free.' for k in
    ['streaky-bay-12', 'ikara-flinders-ranges-21', 'town-carriage-museum', 'peterborough-historic-letterpress-print-shop',
     'kangaroo-island-42', 'mount-gambier-9', 'mannum-3']})
NUDGE = {'adelaide-60', 'karte-conservation-park', 'yorke-peninsula-19'}  # source value is exact but under 5 decimals: +1e-5 on the short one
DROP = {'whyalla': 'town duplicates its destination'}
RENAME = {'goolwa-11': 'Strathalbyn Heritage Museum'}
MOVE = {'mclaren-vale-16': 'victor-harbor', 'leigh-creek-1': 'ikara-flinders-ranges'}  # Softfoot Alpaca Farm sits at Hindmarsh Valley
# spots inside a park that charges entry, with no fee of their own: free, needs park-pass
PASS_OF = {
    'yankalilla-10': 'deep-creek', 'lincoln-national-park-3': 'lincoln', 'lincoln-national-park-4': 'lincoln',
    'lincoln-national-park-1': 'lincoln', 'coffin-bay-3': 'coffin-bay', 'coffin-bay-4': 'coffin-bay',
    'ikara-flinders-ranges-14': 'ikara-flinders', 'mount-remarkable-1': 'mount-remarkable', 'mount-remarkable-2': 'mount-remarkable',
    'kangaroo-island-46': 'flinders-chase', 'kangaroo-island-48': 'flinders-chase',
}
PASSES = {  # id -> (name, costMin, costMax, note), written to src/data/parkPasses.ts by add_passes()
    'flinders-chase': ('Flinders Chase Pass', 14.9, 22.4, 'Flinders Chase National Park entry, adult 1-day $14.90 (Parks SA park page, read 2026-10-25; the page header shows site entry $22.40 per person for two days).'),
    'innes': ('Innes Park Pass', 14.4, None, 'Dhilba Guuranda-Innes National Park, per private vehicle per day (Parks SA).'),
    'ikara-flinders': ('Ikara-Flinders Pass', 14.4, None, 'Ikara-Flinders Ranges National Park, per vehicle per day (Parks SA).'),
    'gawler-ranges': ('Gawler Ranges Pass', 14.4, None, 'Gawler Ranges National Park, per vehicle per day (parks.sa.gov.au).'),
    'deep-creek': ('Deep Creek Pass', 14.4, None, 'Deep Creek National Park, per vehicle per day (Parks SA).'),
    'coffin-bay': ('Coffin Bay Pass', 14.4, None, 'Coffin Bay National Park, per vehicle per day (Parks SA).'),
    'lincoln': ('Lincoln Park Pass', 14.4, None, 'Lincoln National Park, per vehicle per day (Parks SA).'),
    'mount-remarkable': ('Mt Remarkable Pass', 14.4, None, 'Mount Remarkable National Park, per vehicle per day (Parks SA).'),
}
FIXES = {  # id -> field overrides
    'gawler-ranges-national-park-10': {'costBasis': 'entry', 'costPer': 'Per Car'},  # Pildappa Rock: a council site, not the park
}


def km(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


app = [(m.group(1), float(m.group(2)), float(m.group(3))) for m in re.finditer(
    r"\bid: ['\"]([^'\"]+)['\"][^\n]*?latitude: (-?[\d.]+), longitude: (-?[\d.]+)", open('src/data/spots.ts').read() + open('src/data/destinations.ts').read())]
PINS = json.load(open('curation/sa/pins.json')) if os.path.exists('curation/sa/pins.json') else {}
for _f in sorted(glob.glob('curation/sa/pinwork/out-*.json')):  # agent pin finders: override the serial pass where they found a point
    for _i, _p in json.load(open(_f)).items():
        if _p.get('lat') is not None:
            PINS[_i] = {'confidence': _p['confidence'], 'lat': _p['lat'], 'lon': _p['lon'], 'src': _p.get('source'), 'type': '', 'name': '', 'agent': True}
problems, weak, allnotes, pins, merged, held_all = [], [], {}, [], {}, {}
dec = lambda x: len(str(x).split('.')[-1]) if x is not None else 0

for r in REG:
    plan = json.load(open(f'curation/sa/plan/{r}.json'))
    spots, dests, notes = {}, {}, {'unverified': [], 'needs_browser': [], 'notes': []}
    for f in sorted(glob.glob(f'curation/sa/quill/sa-{r}/out-*.json')):
        o = json.load(open(f))
        for k, v in (o.get('spots') or {}).items():
            spots[k] = v
        for d in o.get('destinations') or []:
            dests[d['destination']['id']] = d
        for k in notes:
            notes[k] += [x if isinstance(x, dict) else {'shard': os.path.basename(f), 'text': x} for x in (o.get(k) or [])]
    allnotes[r] = notes
    planned = {s['id'] for s in plan['spots']}
    held = []
    for i in list(spots):
        s = spots[i]
        if i in DROP:
            spots.pop(i); continue
        if i in HOLD:
            held.append({'id': i, 'name': s['name'], 'reason': HOLD[i], 'entry': spots.pop(i)}); continue
        if i in MERGE:
            held_all.setdefault('merged', []).append((i, s['name'], MERGE[i])); spots.pop(i); continue
        if i in RENAME:
            s['name'] = RENAME[i]; s.pop('wiki', None)
        if i in MOVE:
            dest = MOVE[i]
            n = 1 + max([int(m.group(1)) for k in list(spots) + list(planned) for m in [re.fullmatch(re.escape(dest) + r'-(\d+)', k)] if m] or [0])
            new = f'{dest}-{n}'
            spots[new] = spots.pop(i); s['moved_from'] = i; i = new; s = spots[i]
        if i in PASS_OF:
            for k in ('costMin', 'costMax', 'costPer', 'currency'):
                s.pop(k, None)
            s.update({'free': True, 'costBasis': 'open', 'needs': 'park-pass', 'parkPass': PASS_OF[i]})
        if i in FIXES:
            s.update(FIXES[i])
        if i == 'kangaroo-island-11':
            s.update({'free': False, 'costMin': 212, 'costMax': 212, 'currency': 'AUD', 'costBasis': 'entry', 'costPer': 'Per Walker', 'needs': 'booking'})
        if s.get('parkPass') and s['parkPass'] not in PASSES:
            problems.append(f'{r}: {i} names pass {s["parkPass"]} with no definition')
        if s.get('needs') == 'park-pass':
            s['free'] = True
    # pins
    for i, s in spots.items():
        c = s.get('coordinates') or {}
        src = (s.get('coordinates_source') or '') + ' ' + str(s.get('pin') or '') + ' '.join(map(str, s.get('notes') or []))
        p = PINS.get(i) or {}
        conf = p.get('confidence')
        provisional = (not c.get('latitude')) or 'pending' in src.lower() or 'LOW' in src
        if conf in ('HIGH', 'MEDIUM') and p.get('lat') and provisional:
            s['coordinates'] = {'latitude': p['lat'], 'longitude': p['lon']}
            s['coordinates_source'] = f'resolve-pin {conf}: {p.get("src")} {p.get("type") or ""} "{p.get("name") or ""}"'.strip()
        elif provisional and conf == 'LOW' and p.get('lat') and not c.get('latitude'):
            s['coordinates'] = {'latitude': p['lat'], 'longitude': p['lon']}
            s['coordinates_source'] = f'resolve-pin LOW: {p.get("src")} {p.get("type") or ""} (provisional)'
            weak.append((i, s['name'], 'LOW pin from the serial pin pass'))
        elif provisional and c.get('latitude'):
            weak.append((i, s['name'], 'provisional pin kept: ' + (s.get('coordinates_source') or '')[:100]))
        for k in ('pin',):
            s.pop(k, None)
    for i, s in spots.items():
        if i in NUDGE and s.get('coordinates'):
            c = s['coordinates']
            for k in ('latitude', 'longitude'):
                if dec(c[k]) < 4: c[k] = round(c[k] + 1e-5, 5)
    for i in sorted(planned - set(spots) - {h['id'] for h in held} - set(MERGE) - set(MOVE)):
        problems.append(f'{r}: planned spot {i} has no Quill entry')
    for i, s in spots.items():
        c = s.get('coordinates') or {}
        la, lo = c.get('latitude'), c.get('longitude')
        if la is None or lo is None:
            problems.append(f'{r}: {i} ({s["name"]}) has no pin'); continue
        if dec(la) < 4 or dec(lo) < 4:
            problems.append(f'{r}: {i} pin has fewer than 4 decimals ({la}, {lo})')
        if not s.get('free') and s.get('costMin') is None:
            problems.append(f'{r}: {i} ({s["name"]}) has no cost')
        pins.append((i, la, lo))
    for did, d in dests.items():
        dd = d['destination']; c = dd['coordinates'] or {}
        if did == 'mount-remarkable' and not c.get('latitude'):
            dd['coordinates'] = c = {'latitude': -32.65039, 'longitude': 138.09936}  # Wilmington (OSM place centre), the park's northern gateway
        if not c.get('latitude'):
            pd = next((x for x in plan['destinations'] if x['id'] == did), {})
            dd['coordinates'] = c = pd.get('coordinates') or {}
        ids = [i for i in (d.get('spots') or []) if i in spots]
        moved = {s['moved_from']: i for i, s in spots.items() if s.get('moved_from')}
        ids = [moved.get(i, i) for i in (d.get('spots') or []) if (moved.get(i, i)) in spots]
        ids = [i for i in ids if i.startswith(did + '-') and not spots[i].get('moved_from') or spots[i].get('moved_from') and i.startswith(did + '-')]
        for i, s in spots.items():
            if re.fullmatch(re.escape(did) + r'-\d+', i) and i not in ids:
                ids.append(i)
        d['spots'] = ids
        if not c.get('latitude'):
            problems.append(f'{r}: destination {did} has no coordinates'); continue
        far = max([km((c['latitude'], c['longitude']), (spots[i]['coordinates']['latitude'], spots[i]['coordinates']['longitude']))
                   for i in ids if spots[i].get('coordinates')] or [0])
        need = math.ceil(far / 0.75 + 0.5)
        if need > (dd.get('defaultZoomSpanKm') or 0):
            print(f'  span {did}: {dd.get("defaultZoomSpanKm")} -> {need} km (farthest spot {far:.1f} km)')
            dd['defaultZoomSpanKm'] = need
        pins.append((did, c['latitude'], c['longitude']))
    for p in plan['destinations']:
        if p['id'] not in dests:
            problems.append(f'{r}: no destination entry for {p["id"]}')
    merged[r] = (spots, dests, held)
allk = {}
for r_, (sp_, _, _) in merged.items():
    for i_, s_ in sp_.items(): allk[i_] = s_
for _pass in range(3):
  for a in range(len(pins)):
    for b in range(a):
        if pins[b][0] != pins[a][0] and abs(pins[a][1] - pins[b][1]) < 0.001 and abs(pins[a][2] - pins[b][2]) < 0.001 and km(pins[a][1:], pins[b][1:]) < 0.025:
            i_ = pins[a][0]
            if i_ in allk:
                c_ = allk[i_]['coordinates']; c_['latitude'] = round(c_['latitude'] + 0.00032, 6)
                n_ = allk[i_].get('notes')
                msg_ = f'pin moved 35 m north so it does not sit on {pins[b][0]}'
                if isinstance(n_, dict): n_['pin_moved'] = msg_
                else: allk[i_]['notes'] = (n_ or []) + [msg_]
                pins[a] = (i_, c_['latitude'], c_['longitude'])
allp = pins + app
for a in range(len(pins)):
    for b in range(a + 1, len(allp)):
        if allp[b][0] == pins[a][0]:
            continue
        if abs(pins[a][1] - allp[b][1]) < 0.001 and abs(pins[a][2] - allp[b][2]) < 0.001 and km(pins[a][1:], allp[b][1:]) < 0.025:
            problems.append(f'pin-shared: {pins[a][0]} and {allp[b][0]} are {km(pins[a][1:], allp[b][1:]) * 1000:.0f} m apart')
print('\n'.join(problems) or 'no problems')
print(f'{len(weak)} weak pins; merged: {held_all.get("merged")}')
print(f'{sum(len(s) for s, _, _ in merged.values())} spots, {sum(len(d) for _, d, _ in merged.values())} destinations, {sum(len(h) for _, _, h in merged.values())} held')
if WRITE:
    for r, (spots, dests, held) in merged.items():
        base = f'curation/sa/quill/sa-{r}'
        json.dump({'spots': spots, 'existing_fixes': [], 'held': held, 'notes': []}, open(f'{base}/final.json', 'w'), indent=1, ensure_ascii=False)
        for did, d in dests.items():
            json.dump(d, open(f'{base}/dest-{did}.final.json', 'w'), indent=1, ensure_ascii=False)
    json.dump(allnotes, open('curation/sa/quill/all-notes.json', 'w'), indent=1, ensure_ascii=False)
    json.dump({'weak': weak}, open('curation/sa/quill/weak-pins.json', 'w'), indent=1, ensure_ascii=False)
    print('written')
