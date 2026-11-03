#!/usr/bin/env python3
"""Victoria: turn the agreed photo picks (both judges chose the same file) into the list apply-photos.py reads."""
import json, glob, os, re, subprocess, sys, hashlib
from PIL import Image
L = 'curation/victoria/lens-flat/second/'
SRC = 'curation/victoria/lens/photos-src/'
cand = {}
for f in glob.glob(L + 'batch-[0-9][0-9].json'):
    for s in json.load(open(f))['slots']:
        cand[s['id']] = {c['n']: c['file'] for c in s['candidates']}
out = {}
for f in glob.glob(L + 'batch-[0-9][0-9].out.json'): out.update(json.load(open(f)))
norm = lambda x: os.path.basename(str(x)).split('?')[0] if x else x
rows, skipped = [], []
for sid, v in out.items():
    g, slot = sid.split('|', 1)
    d = 'curation/victoria/lens/' + g.replace('--', '/', 1) + '/'
    j1 = json.load(open(d + 'judge-1.json')); j1 = j1.get('slots', j1)
    s1 = {}
    if os.path.exists(d + 'judge-1-search.json'):
        s1 = json.load(open(d + 'judge-1-search.json')); s1 = s1.get('slots', s1)
    r1 = s1.get(slot) or j1.get(slot) or {}
    c1 = r1.get('choice'); ch = v.get('choice')
    f2 = cand.get(sid, {}).get(ch) if isinstance(ch, int) else ch
    if not f2 or not c1 or not (c1 == f2 or norm(c1) == norm(f2)): continue
    # the candidate record (licence, page, author, local file)
    recs = []
    for fn in ('candidates.json', 'candidates-search.json'):
        if os.path.exists(d + fn):
            cj = json.load(open(d + fn)); recs += [e for e in cj.get(slot, []) if isinstance(e, dict)]
    rec = next((e for e in recs if e.get('file') == f2 or e.get('url') == f2 or norm(e.get('file') or e.get('url')) == norm(f2)), {})
    lic = (rec.get('licence') or '')
    if re.search(r'GFDL|NC|all rights|unknown', lic, re.I) and not re.search(r'permission', lic, re.I):
        skipped.append((slot, 'licence ' + lic)); continue
    hc = r1.get('hero_crop'); hc2 = v.get('hero_crop')
    hc = hc if isinstance(hc, dict) else (hc2 if isinstance(hc2, dict) else None)
    url = rec.get('url') or (f2 if str(f2).startswith('http') else None)
    row = {'slot': slot, 'page': rec.get('page'), 'licence': lic or None, 'author': rec.get('by'),
           'hero_crop': hc, 'needs_brighten': False, 'copyright_risk': bool(re.search(r'not confirmed', lic, re.I)), 'group': g}
    if url and not str(f2).startswith('File:') and rec.get('source') != 'commons' and not (rec.get('file') and not url):
        local = rec.get('local')
        if not (local and os.path.exists(local)):
            local = SRC + hashlib.md5(url.encode()).hexdigest()[:12] + '.jpg'
            if not os.path.exists(local):
                subprocess.run(['curl', '-s', '-L', '-A', 'Mozilla/5.0', '--max-time', '40', '-o', local, url])
        try:
            im = Image.open(local); im.load(); w = im.width
        except Exception:
            skipped.append((slot, 'download is not an image (blocked?) ' + url[:90])); continue
        floor = 1500 if slot.endswith(':header') else 1280 if ':why' in slot else 960
        if w < floor:
            skipped.append((slot, f'original only {w}px, floor {floor}: ' + url[:80])); continue
        row['ow'] = w
        row.update(accept=local, source='web')
    else:
        row.update(accept=re.sub(r'^File:', '', f2), source='commons')
    rows.append(row)
json.dump(rows, open('curation/victoria/lens/judge-2-vic.json', 'w'), indent=1, ensure_ascii=False)
json.dump(skipped, open('curation/victoria/lens/judge-2-vic-skipped.json', 'w'), indent=1)
print(len(rows), 'agreed rows;', sum(r['source'] == 'commons' for r in rows), 'commons;', len(skipped), 'skipped')
for s in skipped[:10]: print(s)
