#!/usr/bin/env python3
"""Applies the external-photo search verdicts (curation/sa/search/<b>/): a slot ships only where both judges chose a candidate
(the blind second judge's pick wins when they differ). Written to curation/sa/lens/external.json (staged by stage_external.py),
PHOTO_SUBJECT, and the key leaves NO_PHOTO. Unproven places and non-free licences are skipped and listed."""
import glob, json, os, re, sys
WRITE = '--write' in sys.argv
SKIP = {  # slot -> reason, decided at reconcile
    'spot:gawler-ranges-national-park-1': 'Organ Pipes photo unproven (titled only "Gawler Ranges National Park")',
    'spot:streaky-bay-2': 'Cape Bauer photo: uncaptioned rock, location unproven, soft 3:1 file',
}
slug = lambda k: re.sub(r'[^a-z0-9]+', '-', k.lower()).strip('-')[:60]
q = lambda s: json.dumps(s, ensure_ascii=False)
ov = open('src/data/imageOverrides.ts').read()
EXT = json.load(open('curation/sa/lens/external.json'))
applied, skipped, subjects, keys = [], [], {}, []
def norm(p):
    p = p or ''
    return p if p.startswith('curation/') else ('curation/sa/' + p if p.startswith('search/') else p)
for d in sorted(glob.glob('curation/sa/search/b*/')):
    if not os.path.exists(d + 'judge-2.json'):
        continue
    inn = {s['slot'] if s['slot'].startswith(('spot:', 'dest:')) else 'spot:' + s['id']: s for s in json.load(open(d + 'in.json'))}
    inn.update({'spot:' + s['id']: s for s in json.load(open(d + 'in.json'))})
    cands = json.load(open(d + 'candidates.json'))
    j1 = json.load(open(d + 'judge-1.json')); j2 = json.load(open(d + 'judge-2.json'))
    for slot, b in j2.items():
        a = j1.get(slot) or {}
        s = inn.get(slot) or inn.get('spot:' + slot.replace('spot:', ''))
        ckey = slot if slot in cands else ('spot:' + slot if 'spot:' + slot in cands else slot.replace('spot:', ''))
        cl = cands.get(slot) or cands.get(slot.replace('spot:', '')) or cands.get('spot:' + slot.replace('spot:', '')) or []
        if b.get('decision') != 'choice' or a.get('decision') != 'choice':
            skipped.append((slot, 'judges split/none: ' + str(b.get('choice'))[:70])); continue
        if slot in SKIP or 'spot:' + slot.replace('spot:', '') in SKIP:
            skipped.append((slot, SKIP.get(slot) or SKIP.get('spot:' + slot.replace('spot:', '')))); continue
        ch = norm(b.get('choice'))
        c = next((x for x in cl if norm(x.get('local')) == ch), None)
        if c is None:
            c = next((x for x in cl if os.path.basename(norm(x.get('local'))) == os.path.basename(ch)), None)
        if c is None:
            skipped.append((slot, 'choice does not resolve: ' + ch)); continue
        lic = c.get('licence') or ''
        if re.search(r'\b(ND|NC)\b', lic):
            skipped.append((slot, 'licence ' + lic)); continue
        key = s.get('wiki') or s['name']
        crop = b.get('hero_crop') if isinstance(b.get('hero_crop'), dict) else (a.get('hero_crop') if isinstance(a.get('hero_crop'), dict) else None)
        EXT[slot] = {'local': norm(c['local']), 'name': key, 'key': key, 'by': c.get('by') or 'unknown', 'license': lic or 'unknown',
                     'page': c.get('page') or c.get('url') or ''}
        if crop: subjects[key] = crop
        keys.append(key); applied.append((slot, key, lic, os.path.basename(ch)))
print(len(applied), 'applied;', len(skipped), 'skipped')
for s in skipped: print('  SKIP', s)
for a in applied: print('  OK', a)
if WRITE:
    for k, v in subjects.items():
        line = f'  {q(k)}: {{ ' + ', '.join(f'{c}: {v[c]}' for c in ("x", "y", "zoom") if c in v) + ' },'
        a_ = ov.index('export const PHOTO_SUBJECT'); b_ = ov.index('\n};', a_); blk = ov[a_:b_]
        pat = re.compile(r'^  ' + re.escape(q(k)) + r': .*,$', re.M)
        blk = pat.sub(lambda m: line, blk, 1) if pat.search(blk) else blk + '\n' + line
        ov = ov[:a_] + blk + ov[b_:]
    a_ = ov.index('export const NO_PHOTO'); b_ = ov.index(']);', a_); blk = ov[a_:b_]
    for k in keys:
        blk = blk.replace(f'  {q(k)},\n', '')
    ov = ov[:a_] + blk + ov[b_:]
    open('src/data/imageOverrides.ts', 'w').write(ov)
    json.dump(EXT, open('curation/sa/lens/external.json', 'w'), indent=1, ensure_ascii=False)
    json.dump({'applied': applied, 'skipped': skipped}, open('curation/sa/search/outcome.json', 'w'), indent=1)
    print('written')
