#!/usr/bin/env python3
"""Fiji Lens glue: judge-1 (+ search finds) vs judge-2 agreement -> lens/accepts.json (+ downloads non-Commons originals)."""
import json, glob, os, re, subprocess, urllib.parse
E = 'curation/expand-region-fiji/'
os.makedirs(E + 'photos', exist_ok=True)
def L(p, d=None):
    return json.load(open(p)) if os.path.exists(p) else d
def sl(d): return d.get('slots', d) if isinstance(d, dict) else d
def ident(c): return c.get('url') or c.get('file') or c.get('local')
def is_commons(c):
    u = (c.get('page') or '') + (c.get('url') or '')
    return 'commons.wikimedia.org/wiki/File:' in u or 'upload.wikimedia.org' in u or 'Special:FilePath' in u
def cname(c):
    for u in (c.get('page') or '', c.get('url') or ''):
        m = re.search(r'(?:File:|FilePath/)([^?#]+)', u)
        if m: return urllib.parse.unquote(m.group(1)).replace('_', ' ')
    return None
agree, dis, accepts, noaccept = [], [], [], []
TB = L(E + 'lens/second/tiebreak.out.json', {})
BATCH = {}
for bf in glob.glob(E + 'lens/second/batch-*.json'):
    if bf.endswith('.out.json'): continue
    for e in sl(L(bf, [])): BATCH[e['id']] = {c['n']: c['file'] for c in e['candidates']}
def nm(x): return urllib.parse.unquote(os.path.basename(str(x))).replace('_', ' ').split('?')[0]
for g in sorted(glob.glob(E + 'lens/*/')):
    name = g.rstrip('/').split('/')[-1]
    cands = sl(L(g + 'candidates.json', {})); cs = sl(L(g + 'candidates-search.json', {}))
    j1 = sl(L(g + 'judge-1.json', {})); j1s = sl(L(g + 'judge-1-search.json', {})); j2 = sl(L(g + 'judge-2.json', {}))
    for slot, v2 in j2.items():
        pool = (cands.get(slot) or []) + (cs.get(slot) or [])
        v1 = (j1s.get(slot) or j1.get(slot) or {})
        c1 = v1.get('choice'); c2 = v2.get('choice')
        def find2(ch):
            if ch is None or (isinstance(ch, str) and ch.startswith(('none', 'keep'))): return None
            if isinstance(ch, str) and not ch.isdigit(): return find(ch)
            f = BATCH.get(f'{name}|{slot}', {}).get(int(ch))
            if f is None: return None
            hits = [c for c in pool if f == cname(c) or f == nm(c.get('url')) or f == nm(c.get('local')) or f == c.get('file')]
            if not hits: hits = [c for c in pool if nm(c.get('url')).startswith(str(f)[:30]) or str(f)[:40] in str(c.get('url'))]
            return hits[0] if hits else None
        def find(ch):
            if ch is None or (isinstance(ch, str) and ch.startswith(('none', 'keep'))): return None
            if isinstance(ch, int) or (isinstance(ch, str) and ch.isdigit()):
                hits = [c for c in pool if c.get('n') == int(ch)]
                return hits[0] if len(hits) == 1 else (hits, ch)
            s = str(ch)
            hits = [c for c in pool if s in (ident(c), c.get('local'), c.get('url'), c.get('file')) or (cname(c) and cname(c) in s) or s.endswith(os.path.basename(str(ident(c))))]
            return hits[0] if hits else None
        a, b = find(c1), find2(c2)
        # duplicate n: resolve by the judge's own candidate file name
        if isinstance(b, tuple):
            files = [x.get('file') for x in (v2.get('candidates') or []) if x.get('verdict') == 'accept']
            cand = [c for c in b[0] if any(f and (f in str(ident(c)) or f == cname(c)) for f in files)]
            b = cand[0] if cand else None
        if isinstance(a, tuple): a = None
        key = f'{name}|{slot}'
        tbv = TB.get(f'{name}|{slot}')
        viaTB = False
        if not (a and b and ident(a) == ident(b)) and tbv and tbv.get('agrees_with') in ('A', 'B') and not str(tbv.get('choice')).startswith('none'):
            t = find2(tbv['choice'])
            if t: b = a = t; viaTB = True
            if viaTB and isinstance(tbv.get('hero_crop'), dict): v2 = dict(v2, hero_crop=tbv['hero_crop'])
        if a and b and ident(a) == ident(b):
            agree.append(key + (' (tiebreak)' if viaTB else ''))
            hc = v2.get('hero_crop') if isinstance(v2.get('hero_crop'), dict) else (v1.get('hero_crop') if isinstance(v1.get('hero_crop'), dict) else None)
            acc = {'slot': slot, 'group': name, 'hero_crop': hc, 'licence': b.get('licence'), 'author': b.get('by'), 'page': b.get('page'), 'copyright_risk': 'not confirmed' in (b.get('licence') or '')}
            if is_commons(b) and cname(b):
                acc.update(accept=cname(b), source='commons')
            else:
                loc = b.get('local')
                if not (loc and os.path.exists(loc)):
                    loc = E + 'photos/' + re.sub(r'[^a-z0-9]+', '-', slot.lower()).strip('-') + '.jpg'
                    r = subprocess.run(['curl', '-s', '-L', '-A', 'Mozilla/5.0', '-e', b.get('page') or '', '-o', loc, '-w', '%{http_code}', b['url']], capture_output=True, text=True)
                    if r.stdout.strip() != '200' or os.path.getsize(loc) < 20000:
                        noaccept.append((key, 'download failed ' + r.stdout.strip())); continue
                acc.update(accept=os.path.abspath(loc), source='web')
            accepts.append(acc)
        else:
            dis.append((key, str(c1)[:60], str(c2)[:60]))
json.dump(accepts, open(E + 'lens/accepts.json', 'w'), indent=1, ensure_ascii=False)
json.dump({'agree': agree, 'disagree': dis, 'download_failed': noaccept}, open(E + 'lens/agreement.json', 'w'), indent=1, ensure_ascii=False)
print(len(agree), 'agree;', len(dis), 'disagree/none;', len(noaccept), 'download failed')
for d in dis: print('  DIS', d)
for d in noaccept: print('  DL', d)
