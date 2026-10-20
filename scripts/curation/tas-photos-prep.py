#!/usr/bin/env python3
"""Builds curation/tas/lens/accepts.json for apply-photos.py: slots both judges chose the same file for, plus the arbiter's pick for the
slots they split. Non-Commons picks are downloaded to the scratchpad and listed with their credit and copyright_risk."""
import glob, json, os, re, urllib.request
SCRATCH = '/private/tmp/claude-501/-Users-alexzhou-Developer-mobile-wellington/16edc52c-57b1-4c22-8c60-6565c530b9eb/scratchpad/tas-photos'
os.makedirs(SCRATCH, exist_ok=True)
norm = lambda s: re.sub(r'^File:', '', str(s or '').strip()).replace('_', ' ').lower()
arb = json.load(open('curation/tas/lens/arbiter.json')) if os.path.exists('curation/tas/lens/arbiter.json') else {}
out = []; skipped = []
def dl(url, slot):
    fn = os.path.join(SCRATCH, re.sub(r'[^a-z0-9]+', '-', slot.lower()).strip('-') + '.jpg')
    if not os.path.exists(fn):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        open(fn, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    return fn
for d in sorted(glob.glob('curation/tas/lens/*/')):
    g = d.rstrip('/').split('/')[-1]
    j1 = json.load(open(d + 'judge-1.json')); j1 = j1.get('slots', j1)
    j2 = json.load(open(d + 'judge-2.json')); j2 = j2.get('slots', j2)
    cands = json.load(open(d + 'candidates.json')); cands = cands.get('slots', cands)
    for slot, v2 in j2.items():
        c2 = v2.get('choice'); c1 = (j1.get(slot) or {}).get('choice')
        if not c2 or str(c2).startswith(('none', 'keep-current')): continue
        choice, hc, src = c2, v2.get('hero_crop'), v2
        if norm(c1) != norm(c2):
            a = arb.get(slot)
            if not a or str(a.get('choice')).startswith('neither'): skipped.append((slot, 'judges split, no arbiter pick')); continue
            choice, hc = a['choice'], a.get('hero_crop')
            if norm(choice) == norm(c1): src = j1.get(slot) or {}
        entry = {'slot': slot, 'hero_crop': hc}
        is_url = str(choice).startswith('http') or str(choice).startswith('official:')
        if is_url:
            url = choice if choice.startswith('http') else next((c.get('url') for c in cands.get(slot, []) if isinstance(c, dict) and norm(c.get('file')) == norm(choice)), None)
            cand = next((c for c in cands.get(slot, []) if isinstance(c, dict) and (c.get('url') == url or norm(c.get('file')) == norm(choice))), {})
            if not url: skipped.append((slot, 'no url for ' + str(choice))); continue
            try: fn = dl(url, slot)
            except Exception as e: skipped.append((slot, 'download failed ' + str(e)[:60])); continue
            cr = (src.get('credit') or (j1.get(slot) or {}).get('credit') or {})
            entry.update({'accept': fn, 'page': cr.get('page') or cand.get('page') or '', 'author': cr.get('by') or 'unknown', 'licence': cr.get('licence') or cand.get('licence') or 'official photo, permission not confirmed', 'source': 'official', 'copyright_risk': True})
        else: entry['accept'] = norm(choice) and re.sub(r'^File:', '', str(choice).strip())
        out.append(entry)
json.dump(out, open('curation/tas/lens/accepts.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'accepted;', len(skipped), 'skipped'); [print(' ', s) for s in skipped]
