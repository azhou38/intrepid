#!/usr/bin/env python3
"""Serial pin pass: runs scripts/curation/resolve-pin.py (--json) one spot at a time over every Quill spot whose pin is null, pending or LOW,
and writes curation/sa/pins.json = { <spot id>: { confidence, lat, lon, src, type, name, hint, tried } }. Resumable: ids already in pins.json are skipped.
  python3 curation/sa/pinpass.py [--region sa-adelaide] [--limit N] [--retry-low]
A HIGH or MEDIUM point is applied later (merge); a LOW one stays provisional and is listed for the owner."""
import glob, json, os, re, subprocess, sys, time
a = sys.argv[1:]
only = a[a.index('--region') + 1] if '--region' in a else None
limit = int(a[a.index('--limit') + 1]) if '--limit' in a else 10**9
OUT = 'curation/sa/pins.json'
pins = json.load(open(OUT)) if os.path.exists(OUT) else {}
HINTS = json.load(open('curation/sa/hints.json')) if os.path.exists('curation/sa/hints.json') else {}
plans = {r: json.load(open(f'curation/sa/plan/{r}.json')) for r in [os.path.basename(f)[:-5] for f in glob.glob('curation/sa/plan/*.json')]}
dest_xy = {d['id']: d['coordinates'] for p in plans.values() for d in p['destinations'] if d.get('coordinates')}
CATMAP = {'museum': 'museum', 'landmark': 'landmark', 'monument': 'monument', 'religious': 'religious', 'nature': 'nature', 'viewpoint': 'viewpoint',
          'hike': 'hike', 'entertainment': 'entertainment', 'market': 'market', 'beach': 'beach', 'historic': 'historic'}
todo = []
for f in sorted(glob.glob('curation/sa/quill/sa-*/out-*.json')):
    region = f.split('/')[3]
    if only and region != only: continue
    out = json.load(open(f))
    plan = plans.get(region.replace('sa-', '', 1), {'spots': []})
    pspot = {s['id']: s for s in plan['spots']}
    for sid, s in (out.get('spots') or {}).items():
        c = s.get('coordinates') or {}
        src = (s.get('coordinates_source') or '') + ' ' + str(s.get('pin') or '')
        pending = not c.get('latitude') or 'pending' in src.lower() or 'LOW' in src
        if sid in pins and not ('--retry-low' in a and pins[sid].get('confidence') == 'LOW'): continue
        if not pending: continue
        hint = c if c.get('latitude') else (pspot.get(sid, {}).get('coordinates') or dest_xy.get(pspot.get(sid, {}).get('destination')) or HINTS.get(sid) or None)
        todo.append((region, sid, s, hint))
print(len(todo), 'spots to pin'); n = 0
for region, sid, s, hint in todo[:limit]:
    if not hint: pins[sid] = {'confidence': 'NONE', 'why': 'no hint'}; continue
    cmd = ['python3', 'scripts/curation/resolve-pin.py', '--name', s['name'], '--category', CATMAP.get(s.get('category'), 'nature'),
           '--lat', str(hint['latitude']), '--lon', str(hint['longitude']), '--json'] + (['--wiki', s['wiki']] if s.get('wiki') else [])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
        d = json.loads(r.stdout)
    except Exception as e:
        pins[sid] = {'confidence': 'ERROR', 'why': str(e)[:80], 'hint': hint}; json.dump(pins, open(OUT, 'w'), indent=1); continue
    rec = d.get('recommended') or {}
    pins[sid] = {'confidence': d['confidence'], **{k: rec.get(k) for k in ('lat', 'lon', 'src', 'type', 'name')}, 'agreeing': d.get('agreeing'), 'hint': hint, 'name_in': s['name']}
    n += 1
    if n % 5 == 0: json.dump(pins, open(OUT, 'w'), indent=1, ensure_ascii=False); print(n, 'done', flush=True)
json.dump(pins, open(OUT, 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(Counter(p['confidence'] for p in pins.values()))
