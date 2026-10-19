#!/usr/bin/env python3
"""Adds the NSW destinations whose photos the judges settled: copy (curation/nz-rest/nsw-destinations/<id>.final.json) with the judges'
reason rewrites, header + three why-visit photos (judge-tasks/batch-N.judged.json), subject points, then turns the members into
spots of the destination (nsw-move-spots.py) and registers the destination in scripts/coverage-regions.json.

  python3 scripts/curation/nsw-add-destinations.py [id ...] [--dry-run]

A destination is skipped (and listed) when a why-visit slot has no photo ('none'), or its reasons break the rules after a rewrite.
A destination with no header is added with NO_PHOTO (--allow-no-header)."""
import json, glob, re, subprocess, sys, os, tempfile
base = 'curation/nz-rest/nsw-destinations/'
ids = [a for a in sys.argv[1:] if not a.startswith('--')]
dry = '--dry-run' in sys.argv
judged = {}
for f in sorted(glob.glob(base + 'judge-tasks/batch-*.judged.json')):
    judged.update(json.load(open(f)))
man = {d['id']: d for d in json.load(open(base + 'final-manifest.json'))['destinations']}
nm = lambda c: re.sub(r'^File:', '', c)
ok = lambda c: isinstance(c, str) and not c.lower().startswith('none')
STAGE = {'added': [], 'skipped': [], 'brighten': [], 'weak': []}
MK = re.compile(r"\b(stunning|breathtaking|must[- ]see|world[- ]class|iconic|unforgettable|hidden gem|picturesque|nestled|paradise|spectacular)\b", re.I)
def subject(ov, key, hc):
    if not isinstance(hc, dict): return ov
    val = '{ ' + ', '.join(f'{a}: {hc[a]}' for a in ('x', 'y', 'zoom') if hc.get(a) is not None) + ' }'
    a = ov.index('export const PHOTO_SUBJECT'); b = ov.index('\n};', a)
    line = f'  {json.dumps(key, ensure_ascii=False)}: {val},'
    pat = re.compile(r'^  ' + re.escape(json.dumps(key, ensure_ascii=False)) + r': .*,$', re.M)
    blk = ov[a:b]
    blk = pat.sub(lambda m: line, blk, 1) if pat.search(blk) else blk + '\n' + line
    return ov[:a] + blk + ov[b:]
for did in (ids or list(judged)):
    j = judged.get(did)
    if not j: STAGE['skipped'].append((did, 'not judged')); continue
    fin = json.load(open(base + did + '.final.json')); d = fin['destination']
    for t in d.get('seasonalTags', []):   # writers sometimes wrote `kind` for `tag`
        if 'kind' in t: t['tag'] = t.pop('kind')
    why = j['why']
    if not all(ok(w.get('choice')) for w in why):
        STAGE['skipped'].append((did, 'a why-visit slot has no photo: ' + '; '.join(str(w.get('choice'))[:70] for w in why if not ok(w.get('choice'))))); continue
    adds = [a for a in j.get('add_reasons', []) if ok(a.get('choice'))]
    for a in adds:   # the judge may add reasons (max four in all) when a good photo supports one
        d['whyVisit'].append(a['reason']); d['highlights'].append(a['highlight']); why.append({**a, 'choice': a['choice']})
    for i, w in enumerate(why):
        if w.get('reason_rewrite'): d['whyVisit'][i] = w['reason_rewrite']
        if w.get('highlight_rewrite'): d['highlights'][i] = w['highlight_rewrite']
    bad = [r for r in d['whyVisit'] if not 2 <= len(r.split()) <= 8 or re.search(r'\d', r)] + [h for h in d['highlights'] if not 1 <= len(h.split()) <= 4]
    if bad or MK.search(json.dumps(d)): STAGE['skipped'].append((did, f'copy rules after rewrite: {bad}')); continue
    hdr = j['header'].get('choice')
    picks = {'header': nm(hdr) if ok(hdr) else None, 'why': [nm(w['choice']) for w in why]}
    if len(set(picks['why'])) != len(picks['why']) or not 2 <= len(picks['why']) <= 4: STAGE['skipped'].append((did, 'why photos repeat')); continue
    if dry: STAGE['added'].append(did); continue
    t = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump({'destination': d}, t, ensure_ascii=False); t.close()
    tp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(picks, tp); tp.close()
    cmd = ['python3', 'scripts/curation/apply-destination.py', t.name, '--picks', tp.name] + ([] if picks['header'] else ['--allow-no-header'])
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: STAGE['skipped'].append((did, 'apply-destination: ' + (r.stdout + r.stderr).strip()[:200])); continue
    ov = open('src/data/imageOverrides.ts').read()
    if picks['header']: ov = subject(ov, d['name'], j['header'].get('hero_crop'))
    for w in why: ov = subject(ov, 'File:' + nm(w['choice']), w.get('hero_crop'))
    open('src/data/imageOverrides.ts', 'w').write(ov)
    if j['header'].get('dark') and picks['header']: STAGE['brighten'].append(d['name'])
    STAGE['brighten'] += ['File:' + nm(w['choice']) for w in why if w.get('dark')]
    if j['header'].get('weak') or any(w.get('weak') for w in why): STAGE['weak'].append(did)
    mv = subprocess.run(['python3', 'scripts/curation/nsw-move-spots.py', did], capture_output=True, text=True)
    STAGE['added'].append((did, mv.stdout.strip()[:120]))
    rg = json.load(open('scripts/coverage-regions.json'))
    for r in rg['AU']:
        if r['id'] == man[did]['region']:
            if did not in r['destinations']: r['destinations'].append(did)
            r['standalone'] = [s for s in r.get('standalone', []) if s not in man[did]['members'] + man[did]['self_spots']]
    json.dump(rg, open('scripts/coverage-regions.json', 'w'), indent=2, ensure_ascii=False); open('scripts/coverage-regions.json', 'a').write('\n')
json.dump(STAGE, open(base + 'add-report.json', 'w'), indent=1, ensure_ascii=False)
print('added', len(STAGE['added']), '; skipped', len(STAGE['skipped']))
for s in STAGE['skipped']: print('  skip', s)
