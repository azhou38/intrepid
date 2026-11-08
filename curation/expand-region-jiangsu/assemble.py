#!/usr/bin/env python3
"""Assembles Jiangsu's apply-placement file from Quill's finals, pins and cost recovery. Writes assembled.json + assemble-report.json."""
import json, glob, re, collections
RUN = 'curation/expand-region-jiangsu'
spots = {}
for f in sorted(glob.glob(f'{RUN}/quill/spots-final/W*.json')):
    spots.update(json.load(open(f)))
place = {}
for f in glob.glob(f'{RUN}/quill/shards/*.json'):
    for s in json.load(open(f)):
        place[s['id']] = s
pins = json.load(open(f'{RUN}/pins/pins-merged.json'))
rec = {}
for f in glob.glob(f'{RUN}/quill/cost-recovery/out-*.json'):
    rec.update(json.load(open(f)))
BAD = re.compile(r'起|\bfrom[- ]price|lowest|may be|reportedly|assum|joint|doubt|review|ask the site|promo', re.I)
rep = collections.defaultdict(list)
out = []
for i, s in spots.items():
    p = place.get(i)
    if not p:
        rep['no_placement'].append(i); continue
    s = dict(s)
    # Liuhe Tianfei Palace: Wikivoyage Taicang lists it free
    if i == 'liuhe-tianfei-palace' and s.get('held'):
        s.pop('held'); s.update(free=True, costBasis='entry'); rep['unheld_free'].append(i)
    if s.get('held'):
        r = rec.get(i)
        if r and not r.get('unresolved') and 'no sourced cost' in s['held'] and not BAD.search(r.get('note') or ''):
            s.pop('held')
            if r.get('free'):
                s['free'] = True
            else:
                s['costMin'] = r['costMin']; s['costMax'] = r.get('costMax', r['costMin'])
            s['currency'] = 'CNY'; s['costBasis'] = r.get('costBasis') or 'entry'
            for k in ('costPer', 'needs'):
                if r.get(k): s[k] = r[k]
            s['cost_source'] = r.get('source_url'); s['cost_confidence'] = r.get('confidence')
            rep['recovered'].append(i)
        elif r and not r.get('unresolved'):
            rep['recovered_rejected'].append((i, (r.get('note') or '')[:80]))
    if s.get('held'):
        rep['held'].append((i, s['name'], s['held'])); continue
    pin = pins.get(i)
    if not pin or pin.get('lat') is None:
        rep['no_pin'].append((i, s['name'])); continue
    if not (s.get('free') or s.get('costMin') is not None):
        rep['no_cost'].append((i, s['name'])); continue
    act = 'spot' if p['action'] == 'spot' else 'standalone'
    spot = {k: s[k] for k in ['name', 'wiki', 'icon', 'category', 'bio', 'visitHoursMin', 'visitHoursMax', 'free', 'costMin', 'costMax', 'currency', 'costBasis', 'costPer', 'needs', 'ticketUrl'] if k in s and s[k] is not None}
    spot.setdefault('currency', 'CNY')
    out.append({'id': i, 'name': s['name'], 'action': act, 'destination': p.get('destination') if act == 'spot' else None,
                'coordinates': {'latitude': pin['lat'], 'longitude': pin['lon']}, 'photoless': True, 'photo': None, 'photo_verdict': 'accept',
                'pin_confidence': pin['confidence'], 'cost_confidence': s.get('cost_confidence'), 'spot': spot})
by = collections.Counter(e['destination'] for e in out if e['action'] == 'spot')
dests = {}
for f in glob.glob(f'{RUN}/quill/dest/*.json'):
    d = json.load(open(f))['destination']; dests[d['id']] = d
demoted = [d for d, n in by.items() if n < 4 and dests[d]['rank'] > 2] + [d for d in dests if d not in by and dests[d]['rank'] > 2]
rep['demoted_destinations'] = demoted
def slug(n): return re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
taken = {e['id'] for e in out if e['action'] == 'standalone'} | set(dests)
for e in out:
    if e['action'] == 'spot' and e['destination'] in demoted:
        new = slug(e['name'])
        if new in taken: new += '-' + e['destination']
        taken.add(new); rep['renamed'].append((e['id'], new))
        e['id'] = new; e['action'] = 'standalone'; e['destination'] = None
    if e['action'] == 'standalone':
        e['spot'].update(country='China', countryCode='CN', continent='Asia', timezone='Asia/Shanghai')
by = collections.Counter(e['destination'] for e in out if e['action'] == 'spot')
rep['live_destinations'] = dict(by)
def okey(e):
    m = re.search(r'-(\d+)$', e['id'])
    return (e['destination'] or 'zz', int(m.group(1)) if m else 999)
out.sort(key=okey)
json.dump({'placements': out}, open(f'{RUN}/assembled.json', 'w'), ensure_ascii=False, indent=1)
json.dump(rep, open(f'{RUN}/assemble-report.json', 'w'), ensure_ascii=False, indent=1)
print(len(out), 'ready;', {k: len(v) for k, v in rep.items()})
print(dict(by))
