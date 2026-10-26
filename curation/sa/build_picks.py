#!/usr/bin/env python3
"""Builds curation/wa/quill/<region>/picks-<id>.json ({header, why: [...]}) for apply-destination.py from the Lens judges.

A slot's photo ships only where both judges chose the same file (judge-1.json and judge-2.json in curation/sa/lens/<group>/).
Reports every slot that is not agreed (disagreement, 'none', or not judged yet). Run from the repo root:

  python3 curation/wa/build_picks.py [--write]
"""
import glob, json, os, sys

WRITE = '--write' in sys.argv
dests = {}
for f in glob.glob('curation/sa/quill/sa-*/dest-*.final.json'):
    d = json.load(open(f))['destination']
    dests[d['id']] = (os.path.dirname(f), len(d['whyVisit']))
EXT = json.load(open('curation/sa/lens/external.json')) if os.path.exists('curation/sa/lens/external.json') else {}
agreed, open_, crop = {}, [], {}
for g in sorted(glob.glob('curation/sa/lens/dest-*/'), key=lambda p: int(p.rstrip('/').split('-')[-1])):
    t = json.load(open(f'{g}task.json'))
    j1 = json.load(open(f'{g}judge-1.json')) if os.path.exists(f'{g}judge-1.json') else {}
    j2 = json.load(open(f'{g}judge-2.json')) if os.path.exists(f'{g}judge-2.json') else {}
    # decided.json: the orchestrator's tie-breaks and post-reword picks, each with its reason (reported in the final report)
    dec = json.load(open(f'{g}decided.json')) if os.path.exists(f'{g}decided.json') else {}
    for s in t['slots']:
        k = s['slot']
        a, b = (j1.get(k) or {}).get('choice'), (j2.get(k) or {}).get('choice')
        if k in dec:
            agreed[k] = dec[k]['choice']
        elif a and b and a == b and not a.startswith('none'):
            agreed[k] = a
        if k in agreed:
            if k in EXT:
                agreed[k] = EXT[k]['name']
            # crop point: the second judge's, else the first's, only when that judge chose the shipped file
            for j in (j2, j1):
                v = j.get(k) or {}
                if isinstance(v.get('hero_crop'), dict) and (v.get('choice') or '').startswith(agreed[k].split(' (')[0][:20]):
                    crop[k] = {a_: v['hero_crop'][a_] for a_ in ('x', 'y', 'zoom') if v['hero_crop'].get(a_) is not None}
                    break
        else:
            open_.append((k, a, b))
ready = []
for did, (base, n) in sorted(dests.items()):
    hdr = agreed.get(f'dest:{did}:header')
    why = [agreed.get(f'dest:{did}:why{i}') for i in range(1, n + 1)]
    why = [w or '' for w in why]
    if True:
        ready.append(did)
        if WRITE:
            subj = {}
            if f'dest:{did}:header' in crop:
                subj['header'] = crop[f'dest:{did}:header']
            for i, w in enumerate(why, 1):
                if f'dest:{did}:why{i}' in crop:
                    subj[f'File:{w}'] = crop[f'dest:{did}:why{i}']
            json.dump({'header': hdr, 'why': why, 'subjects': subj}, open(f'{base}/picks-{did}.json', 'w'), indent=1, ensure_ascii=False)
print('ready:', len(ready), ready)
print('grey why slots:', sum(1 for d in ready for i in range(1, dests[d][1]+1) if not agreed.get(f'dest:{d}:why{i}')))
print('no header:', [d for d in dests if d not in ready])
print('not agreed:')
for k, a, b in open_:
    print(f'  {k}: judge-1 {a!r} | judge-2 {b!r}')
