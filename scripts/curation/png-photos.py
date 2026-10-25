#!/usr/bin/env python3
"""Applies the Papua New Guinea photo decisions (both judges agreed) to src/data, then writes the "Photos still missing" list.

  python3 scripts/curation/png-photos.py            # stage: downloads external photos, writes the accepts file, runs apply-photos.py stage,
                                                    # adds subject points for kept photos, adds NO_PHOTO for the slots with no passing photo
  (commit + push assets/photos, then:  python3 scripts/curation/apply-photos.py link)

A slot is accepted only where both judges chose the same file (PIPELINES.md Pipeline B): a Commons file both chose, a non-Commons photo
the searcher chose and the blind judge accepted, or a current photo the first judge kept. Everything else has no photo (NO_PHOTO), so the
app shows a plain pin and never a wrong picture (a map, a flag, another country's cemetery).
"""
import json, os, re, subprocess, sys, urllib.request

SCRATCH = '/private/tmp/claude-501/-Users-alexzhou-Developer-mobile-wellington/16edc52c-57b1-4c22-8c60-6565c530b9eb/scratchpad/png-photos'
os.makedirs(SCRATCH, exist_ok=True)
L = 'curation/png/lens'
applied = json.load(open('curation/png/applied.json'))['added']
spots_src = open('src/data/spots.ts').read()

def key_of(sid):
    m = re.search(r"\{ id: \"%s\",[^\n]*" % re.escape(sid), spots_src) or re.search(r"\{ id: '%s',[^\n]*" % re.escape(sid), spots_src)
    l = m.group(0)
    w = re.search(r'\bwiki: "((?:[^"\\]|\\.)*)"', l)
    if w: return json.loads('"' + w.group(1) + '"')
    return json.loads('"' + re.search(r'\bname: "((?:[^"\\]|\\.)*)"', l).group(1) + '"')

def jget(f):
    d = json.load(open(f)); return d.get('slots', d)

# 1. Commons accepts: both judges chose the same file.
accept = []   # entries for apply-photos.py
decided = {}
for g in (1, 2, 3):
    j1 = jget(f'{L}/group-{g}/judge-1.json'); j2 = jget(f'{L}/group-{g}/judge-2.json')
    for slot, v2 in j2.items():
        slot = slot if slot.startswith('spot:') else 'spot:' + slot
        v1 = j1.get(slot) or {}
        c1, c2 = (v1.get('choice') or ''), (v2.get('choice') or '')
        # The second judge's pick is accepted if the first judge also marked it acceptable.
        ok1 = {(c.get('file') if isinstance(c, dict) else c) for c in v1.get('candidates', []) if not isinstance(c, dict) or c.get('verdict') == 'accept'} | {c1}
        if c2 and not c2.startswith('none') and c2 != 'keep-current' and c2 in ok1:
            decided[slot] = ('new', c2, v2.get('hero_crop'), v1)
    for slot, v1 in j1.items():
        if (v1.get('choice') or '') == 'keep-current': decided.setdefault(slot, ('keep', None, v1.get('hero_crop'), v1))

# The first judge kept these, but they fail the checks (people as the subject; an aerial not proven to be inside the area).
REJECT_KEEP = {'spot:mount-hagen', 'spot:tonda-wildlife-management-area'}

# 2. Non-Commons: the searcher's choice + the blind judge's acceptance.
nc = json.load(open(f'{L}/non-commons.json')); jn = json.load(open(f'{L}/judge-2-noncommons.json'))
ext = {}
for slot, v in jn.items():
    s = slot if slot.startswith('spot:') else 'spot:' + slot
    c = v.get('choice') or ''
    if c.startswith('http'):
        cand = next((x for x in (nc.get(s, {}).get('candidates') or []) + [nc.get(s, {}).get('choice') or {}] if x.get('url') == c), {})
        ext[s] = {'url': c, 'page': cand.get('page') or next((x.get('page') for x in v.get('candidates', []) if x.get('url') == c), ''), 'licence': cand.get('licence') or 'CC BY 2.0',
                  'author': cand.get('credit') or 'Flickr', 'hero_crop': v.get('hero_crop')}
# The two Flickr photos both group-3 judges accepted.
for s in ('spot:kairiru-island', 'spot:mushu-island'):
    d = decided.pop(s, None)
    if d:
        v1 = d[3]; ext[s] = {'url': d[1], 'page': (v1.get('credit') or {}).get('page', ''), 'licence': 'CC BY 2.0', 'author': (v1.get('credit') or {}).get('by', 'welix'), 'hero_crop': d[2]}

pending_ext = []
for s, e in ext.items():
    fn = os.path.join(SCRATCH, s.split(':')[1] + '.jpg')
    if not os.path.exists(fn):
        req = urllib.request.Request(e['url'], headers={'User-Agent': 'IntrepidApp-Curation/1.0'})
        open(fn, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    accept.append({'slot': s, 'accept': fn, 'page': e['page'], 'hero_crop': e['hero_crop'], 'author': e['author'], 'licence': e['licence'], 'source': 'flickr'})

for slot, (kind, f, hc, v1) in decided.items():
    if slot in REJECT_KEEP or kind != 'new': continue
    accept.append({'slot': slot, 'accept': f, 'hero_crop': hc})
json.dump(accept, open(f'{L}/judge-2-all.json', 'w'), indent=1, ensure_ascii=False)
print(len(accept), 'accepted new photos:', [a['slot'] for a in accept])
print('stage:', subprocess.run(['python3', 'scripts/curation/apply-photos.py', 'stage'], capture_output=True, text=True, env={**os.environ, 'JUDGE_GLOB': f'{L}/judge-2-all.json'}).stdout[-600:])

# 3. Kept current photos get their subject point; every other slot gets NO_PHOTO.
ov = open('src/data/imageOverrides.ts').read()
def set_in(block, key, val):
    global ov
    a = ov.index('export const ' + block); b = ov.index('\n};', a); blk = ov[a:b]
    kk = json.dumps(key, ensure_ascii=False); pat = re.compile(r'^  ' + re.escape(kk) + r': .*,$', re.M)
    blk = pat.sub(lambda m: f'  {kk}: {val},', blk, 1) if pat.search(blk) else blk + f'\n  {kk}: {val},'
    ov = ov[:a] + blk + ov[b:]
have = {a['slot'] for a in accept}
kept = [s for s, (k, _, _, _) in decided.items() if k == 'keep' and s not in REJECT_KEEP]
for s in kept:
    hc = decided[s][2]
    if isinstance(hc, dict): set_in('PHOTO_SUBJECT', key_of(s[5:]), '{ ' + ', '.join(f'{a}: {hc[a]}' for a in ('x', 'y', 'zoom') if hc.get(a) is not None) + ' }')
missing = [sid for sid in applied if 'spot:' + sid not in have and 'spot:' + sid not in kept]
a = ov.index('export const NO_PHOTO'); b = ov.index('\n]);', a)
blk = ov[a:b]
for sid in missing:
    k = json.dumps(key_of(sid), ensure_ascii=False)
    if k not in blk: blk += f'\n  {k},'
ov = ov[:a] + blk + ov[b:]
open('src/data/imageOverrides.ts', 'w').write(ov)
json.dump({'new': sorted(have), 'kept': kept, 'missing': missing}, open(f'{L}/final-photos.json', 'w'), indent=1)
print('kept current:', len(kept), '| no photo:', len(missing))
