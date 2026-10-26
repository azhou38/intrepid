#!/usr/bin/env python3
"""Normalises each region's placement.json (the proposers wrote several shapes) into curation/sa/plan/<region>.json:
   { region, destinations: [ {id, name, category, rank, coordinates, coordinates_source, defaultZoomSpanKm, name_evidence, spots: [ids]} ],
     spots: [ {id, name, destination|None, category, icon, bio, wiki, coordinates, coordinates_source, visitHoursMin, visitHoursMax, free, costMin,
               costMax, currency, costBasis, costPer, needs, ticketUrl, needs_research, note, sources, views, counted_sources} ], review: [...], merged: [...] }
   python3 curation/sa/build_plan.py [region-id ...]"""
import json, os, re, sys
R = ['adelaide','barossa-clare','eyre','fleurieu','flinders','kangaroo-island','limestone-coast','murray-coorong','outback','yorke']
args = [re.sub(r'^sa-', '', a) for a in sys.argv[1:]] or R
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', re.sub(r'\([^)]*\)', '', s.lower().replace("'", '')).strip()).strip('-')
def coord(c):
    if not c: return None
    if isinstance(c, dict):
        la = c.get('latitude', c.get('lat')); lo = c.get('longitude', c.get('lng', c.get('lon')))
        return {'latitude': la, 'longitude': lo} if la is not None and lo is not None else None
    if isinstance(c, (list, tuple)) and len(c) == 2: return {'latitude': c[0], 'longitude': c[1]}
    return None
FIELDS = ['category', 'icon', 'bio', 'wiki', 'coordinates_source', 'visitHoursMin', 'visitHoursMax', 'free', 'costMin', 'costMax', 'currency', 'costBasis', 'costPer', 'needs', 'ticketUrl', 'needs_research', 'views', 'counted_sources']
LISTS = ['spots', 'places', 'placements', 'entries', 'standalone', 'standalones']
DESTK = ['new_destinations', 'destinations', 'proposed_new_destinations', 'proposed_destinations']
os.makedirs('curation/sa/plan', exist_ok=True)
for r in args:
    d = f'curation/sa/region-sa-{r}'
    if not os.path.exists(f'{d}/placement.json'): print(r, 'no placement yet'); continue
    p = json.load(open(f'{d}/placement.json'))
    cands = {c['name']: c for c in json.load(open(f'{d}/candidates.json'))}
    dests, spots, seen = [], [], set()
    for k in DESTK:
        for x in p.get(k) or []:
            if isinstance(x, dict) and x.get('id') and x['id'] not in {y['id'] for y in dests}:
                dests.append({'id': x['id'], 'name': x['name'], 'category': x.get('category'), 'rank': x.get('rank'), 'coordinates': coord(x.get('coordinates')),
                              'coordinates_source': x.get('coordinates_source'), 'defaultZoomSpanKm': x.get('defaultZoomSpanKm') or x.get('span_km'),
                              'name_evidence': x.get('name_evidence'), 'spots': list(x.get('spots') or []) if all(isinstance(s, str) for s in (x.get('spots') or [])) else [],
                              '_detail': x.get('spots_detail') or ([s for s in x.get('spots') or [] if isinstance(s, dict)])})
    def add(e, dest, standalone):
        if not isinstance(e, dict) or not e.get('name'): return
        c = cands.get(e['name'], cands.get(e.get('candidate', ''), {})) or {}
        sid = e.get('id') or (slug(e['name']) if standalone else None)
        if not sid or sid in seen: return
        seen.add(sid)
        s = {k: e.get(k) for k in FIELDS}
        cost = e.get('cost') if isinstance(e.get('cost'), dict) else {}
        for k in ('free', 'costMin', 'costMax', 'currency', 'costBasis', 'costPer', 'needs'): s[k] = s[k] if s[k] is not None else cost.get(k)
        s.update({'id': sid, 'name': e['name'], 'destination': None if standalone else (e.get('destination') or dest), 'coordinates': coord(e.get('coordinates')),
                  'note': e.get('reason') or e.get('note'), 'sources': e.get('sources') or c.get('counted_sources') or [], 'views': e.get('views', c.get('views')),
                  'counted_sources': e.get('counted_sources', len(c.get('counted_sources') or []) if isinstance(c.get('counted_sources'), list) else c.get('counted_sources'))})
        s['needs_research'] = sorted(set(s.get('needs_research') or []) | ({'coordinates'} if not s['coordinates'] else set()))
        spots.append(s)
    for k in LISTS:
        for e in p.get(k) or []:
            if isinstance(e, dict):
                standalone = k.startswith('standalone') or e.get('action') == 'standalone' or not (e.get('destination'))
                add(e, e.get('destination'), standalone and e.get('action') != 'spot')
    for dd in dests:
        for e in dd.pop('_detail'): add(e, dd['id'], False)
    # destination spot lists: ids in importance order
    ids = {s['id'] for s in spots}
    for dd in dests:
        mine = [s['id'] for s in spots if s['destination'] == dd['id']]
        dd['spots'] = [i for i in dd['spots'] if i in ids] + [i for i in mine if i not in dd['spots']]
    json.dump({'region': f'sa-{r}', 'destinations': dests, 'spots': spots, 'review': p.get('review', []), 'merged': p.get('merged', []), 'duplicates_elsewhere': p.get('duplicates_elsewhere', [])},
              open(f'curation/sa/plan/{r}.json', 'w'), indent=1, ensure_ascii=False)
    n_dest = sum(1 for s in spots if s['destination']); nopin = sum(1 for s in spots if not s['coordinates'])
    print(f'{r}: {len(dests)} destinations, {len(spots)} spots ({n_dest} in destinations, {len(spots) - n_dest} standalone), {nopin} without a pin, {len(p.get("review", []))} review')
