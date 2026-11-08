#!/usr/bin/env python3
"""Turns the Jiangsu judges' verdicts into the verdict list apply-photos.py reads (judge-2-all.json), downloading the full-size
originals of non-Commons accepts into curation/expand-region-jiangsu/lens/originals/."""
import glob, json, os, re, subprocess, urllib.parse
L = 'curation/expand-region-jiangsu/lens/'
os.makedirs(L + 'originals', exist_ok=True)
out, problems = [], []
JT = {}
for bf in [b for b in glob.glob(L + 'second/batch-*.json') if not b.endswith('.out.json')]:
    d = json.load(open(bf)); d = d if isinstance(d, list) else d.get('slots', d)
    for it in (d if isinstance(d, list) else d.values()):
        JT[it['id']] = it['judge_this']['file']
for g in sorted(os.listdir(L)):
    jf = L + g + '/judge-2.json'
    if not os.path.exists(jf): continue
    j2 = json.load(open(jf))
    cands = {}
    for f in ('candidates.json', 'candidates-search.json'):
        p = L + g + '/' + f
        if os.path.exists(p):
            for slot, v in json.load(open(p)).items():
                if not slot.startswith('_') and isinstance(v, list): cands.setdefault(slot, []).extend(v)
    for slot, v in j2.items():
        if not v.get('pass'): continue
        choice = JT.get(g + '|' + slot) or v.get('choice') or ''
        c = next((x for x in cands.get(slot, []) if choice in (x.get('file'), x.get('url'), x.get('local'))), None)
        if not c:   # the judge wrote the source page as the choice: take the first judge's passing candidate number
            j1 = json.load(open(L + g + '/judge-1.json')).get(slot, {})
            ns = [x.get('n') for x in (j1.get('candidates') or []) if isinstance(x, dict) and x.get('verdict') == 'pass' and x.get('n')]
            c = next((x for x in cands.get(slot, []) if x.get('n') in ns and (x.get('page') == choice or not choice.startswith('http') or True) and (choice in (x.get('page'), x.get('url')) or x.get('page', '').startswith(choice[:60]))), None)
        if not c: problems.append((g, slot, 'no candidate record for ' + choice[:60])); continue
        hc = v.get('hero_crop'); hc = hc if isinstance(hc, dict) else None
        commons = 'commons.wikimedia.org' in (c.get('page') or '') or c.get('source') in ('wikipedia-lead', 'commons-name', 'commons-geo') or (c.get('file') and not c.get('url'))
        r = {'slot': slot, 'group': g, 'hero_crop': hc, 'licence': c.get('licence'), 'author': c.get('by'), 'page': c.get('page')}
        if commons and c.get('file'):
            r.update(accept=c['file'], source='commons')
        else:
            local = c.get('local')
            if not (local and os.path.exists(local)):
                fn = L + 'originals/' + re.sub(r'[^A-Za-z0-9]+', '-', g + slot)[:80] + '.jpg'
                if not os.path.exists(fn) or os.path.getsize(fn) < 5000:
                    subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', '--max-time', '60', '-e', c.get('page') or '', '-o', fn, c['url']])
                local = fn
            if not os.path.exists(local) or os.path.getsize(local) < 5000: problems.append((g, slot, 'download failed ' + c.get('url', '')[:80])); continue
            r.update(accept=os.path.abspath(local), source='web')
        out.append(r)
json.dump(out, open(L + 'judge-2-all.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'accepts;', sum(1 for r in out if r['source'] == 'web'), 'web;', len(problems), 'problems')
for p in problems: print(p)
