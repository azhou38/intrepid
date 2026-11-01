#!/usr/bin/env python3
"""Fiji: merge placement + pins + Quill research into apply/ inputs (apply-destination.py / apply-placement.py)."""
import json, glob, os
B = 'curation/expand-region-fiji/'
pl = json.load(open(B + 'placement.all.json'))
pins = json.load(open(B + 'pins.final.json'))
for f in sorted(glob.glob(B + 'pins.agent.3.json')):
    for e in json.load(open(f)):
        if e.get('lat') is not None and e['confidence'] in ('HIGH', 'MEDIUM'):
            pins[e['id']] = {'lat': e['lat'], 'lng': e['lng'], 'confidence': e['confidence'], 'source': e.get('source', '') + ' ' + e.get('feature_type', '')}
res = {}
for f in glob.glob(B + 'quill/shard-*.research.json'):
    d = json.load(open(f)); d = d.get('spots', d) if isinstance(d, dict) else d
    for e in d: res[e['id']] = e
HOLD_EXTRA = {'levuka-6': 'Caqalai: resort closed until further notice, access unconfirmed'}
dests = {x['id']: x for x in pl['new_destinations']}
held, placements, overrides = [], [], {}
for s in pl['spots']:
    i = s['id']; r = res.get(i); why = None
    if i not in pins: why = 'no sourced pin'
    elif not r: why = 'no research'
    elif r.get('drop'): why = 'dropped by fact-check (no source names it)'
    elif i in HOLD_EXTRA: why = HOLD_EXTRA[i]
    elif r.get('cost_unresolved') or not (r.get('free') or r.get('costMin') is not None): why = 'no cost found'
    if why: held.append({'id': i, 'name': s['name'], 'why': why}); continue
    p = pins[i]
    sa = s['action'] != 'spot'
    spot = {'name': s['name'], 'icon': s.get('icon', '📍'), 'category': s['category'], 'bio': r['bio'], 'visitHoursMin': r.get('visitHoursMin', s.get('visitHoursMin')), 'visitHoursMax': r.get('visitHoursMax', s.get('visitHoursMax'))}
    if r.get('wiki'): spot['wiki'] = r['wiki']
    if sa: spot.update(country='Fiji', countryCode='FJ', continent='Oceania', timezone='Pacific/Fiji')
    pe = {'id': i, 'name': s['name'], 'action': 'spot' if s['action'] == 'spot' else 'standalone', 'destination': s.get('destination'),
          'coordinates': {'latitude': p['lat'], 'longitude': p['lng']}, 'spot': spot, 'photoless': True,
          'coordinates_source': f"{p['source'].strip()}; {p['confidence']}"}
    placements.append(pe)
    o = {k: r.get(k) for k in ('bio', 'free', 'costMin', 'costMax', 'currency', 'costBasis', 'costPer', 'needs', 'parkPass', 'ticketUrl', 'visitHoursMin', 'visitHoursMax', 'wiki') if r.get(k) is not None or k in ('ticketUrl',)}
    if o.get('ticketUrl') and str(o['ticketUrl']).startswith('BLOCKED'): o['ticketUrl'] = None
    o['currency'] = o.get('currency') or 'FJD'
    overrides[i] = o
json.dump({'placements': placements}, open(B + 'apply/apply-placement.json', 'w'), indent=1, ensure_ascii=False)
json.dump({'spots': overrides}, open(B + 'apply/overrides.json', 'w'), indent=1, ensure_ascii=False)
for did in dests:
    d = json.load(open(B + f'quill/dest-{did}.json')); d = d.get('destination', d)
    sp = {k: v for k, v in overrides.items() if any(p['id'] == k and p['destination'] == did for p in placements)}
    json.dump({'destination': d, 'spots': sp, 'notes': 'Fiji run'}, open(B + f'apply/{did}.final.json', 'w'), indent=1, ensure_ascii=False)
json.dump(held, open(B + 'apply/held.json', 'w'), indent=1, ensure_ascii=False)
print(len(placements), 'placed;', len(held), 'held'); [print(' ', h['id'], h['why']) for h in held]
