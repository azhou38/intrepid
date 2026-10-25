#!/usr/bin/env python3
"""Applies the Lens spot-photo verdicts for one WA region (curation/act/lens-spots/<region>/<group>/).

  python3 curation/act/apply_spot_photos.py <region> [--write]

Per spot slot (task.json): a `proven` slot or a first-judge `keep-current` keeps its current photo (its hero_crop, if any, goes to
PHOTO_SUBJECT). Otherwise the photo ships only where both judges chose the same candidate (judge-1 may name a non-Commons
candidate by description, judge-2 by its local path: both are resolved to the candidate in candidates.json). A Commons file goes to
WIKI_IMAGE_OVERRIDES under the spot's photo key; a downloaded non-Commons photo goes to curation/act/lens/external.json (staged,
committed and linked with stage_external.py). A slot whose current photo was rejected or that needed a search, with no agreed
replacement, goes to NO_PHOTO (the placeholder), never left on a wrong photo; it is listed for "Photos still missing".
Disagreements are listed for a tie-break and left unapplied. decided.json in a group folder overrides both judges (tie-breaks).
"""
import glob, json, os, re, sys

region = sys.argv[1]
WRITE = '--write' in sys.argv
q = lambda s: json.dumps(s, ensure_ascii=False)
slug = lambda k: re.sub(r'[^a-z0-9]+', '-', k.lower()).strip('-')[:60]


def resolve(choice, cands):
    """The candidate a judge's choice names, or None (keep-current / none / reject / unknown)."""
    if not choice or re.match(r'^(none|keep-current|reject)', choice):
        return None
    c = choice.replace('File:', '').strip()
    for x in cands:
        f, loc = x.get('file') or '', x.get('local') or ''
        if c in (f, loc) or (loc and os.path.basename(loc) == os.path.basename(c)):
            return x
    for x in cands:   # a description: match an id or file stem the candidate carries
        for ref in (x.get('file'), x.get('local'), x.get('url'), x.get('page')):
            if not ref:
                continue
            stem = os.path.splitext(os.path.basename(ref.rstrip('/')))[0]
            ids = re.findall(r'\d{8,}', ref)
            if (len(stem) > 6 and stem in c) or any(i in c for i in ids):
                return x
    # a description of a non-Commons photo ("Jewel Cave interior (MRBTA)") when the slot has exactly one downloaded candidate
    locals_ = [x for x in cands if x.get('local')]
    if len(locals_) == 1 and not re.search(r'\.(jpe?g|png|tiff?|webp)$', c, re.I):
        return locals_[0]
    return None


ov = open('src/data/imageOverrides.ts').read()
EXT = json.load(open('curation/act/lens/external.json'))
overrides, subjects, no_photo, external, missing, disagree, kept = {}, {}, [], {}, [], [], 0
for g in sorted(glob.glob(f'curation/act/lens-spots/{region}/*/')):
    t = json.load(open(g + 'task.json'))
    cands = json.load(open(g + 'candidates.json')) if os.path.exists(g + 'candidates.json') else {}
    j1 = json.load(open(g + 'judge-1.json')) if os.path.exists(g + 'judge-1.json') else {}
    j2 = json.load(open(g + 'judge-2.json')) if os.path.exists(g + 'judge-2.json') else {}
    dec = json.load(open(g + 'decided.json')) if os.path.exists(g + 'decided.json') else {}
    for s in t['slots']:
        k, key = s['slot'], s['key']
        a, b = (j1.get(k) or {}), (j2.get(k) or {})
        ca = a.get('choice') or ''
        if k not in dec and (s['status'] == 'proven' and not ca or ca == 'keep-current'):
            kept += 1
            if isinstance(a.get('hero_crop'), dict):
                subjects[key] = a['hero_crop']
            continue
        cl = cands.get(k, [])
        if k not in dec and (b.get('choice') or '').startswith('keep-current'):
            # judge-2 looked at the current photo (blind) and judged it better than the candidates. A `proven` or `search` slot
            # keeps it (the script proved it, or judge-1 only preferred another file); a `confirm` slot's current photo was rejected
            # by the confirm judge, so one judge accepts and one rejects: not agreed, the placeholder shows and it is listed.
            if s['status'] in ('proven', 'search'):
                kept += 1; continue
            no_photo.append(key); missing.append((k, key, 'confirm judge rejected the current photo; second judge kept it (split)')); continue
        x = resolve(dec[k]['choice'], cl) if k in dec else resolve(ca, cl)
        y = x if k in dec else resolve(b.get('choice') or '', cl)
        if x is not None and x is y:
            crop = next((v.get('hero_crop') for v in (b, a) if isinstance(v.get('hero_crop'), dict)), None)
            if x.get('local'):
                name = f'ext-{slug(key)}.jpg'
                cr = x.get('credit') or a.get('credit') or {}
                external[k] = {'local': x['local'], 'name': name, 'key': key, 'by': cr.get('by', ''),
                               'license': cr.get('license') or x.get('licence') or 'unknown', 'page': cr.get('page') or x.get('page') or ''}
                if crop:
                    subjects[key] = crop
            elif x.get('file'):
                overrides[key] = x['file'].replace('File:', '')
                if crop:
                    subjects[key] = crop
            continue
        if x is None and y is None or (k not in dec and (not ca or ca.startswith(('none', 'reject'))) and y is None):
            if s['status'] in ('search', 'proven', 'confirm'):
                no_photo.append(key); missing.append((k, key, ca or b.get('choice') or 'no candidate'))
            continue
        if x is None or y is None:   # one judge found no passing photo: nothing ships, the placeholder shows
            no_photo.append(key); missing.append((k, key, f'judges split: {ca[:60]} / {(b.get("choice") or "")[:60]}')); continue
        disagree.append((k, key, ca, b.get('choice')))
print(f'{region}: kept {kept}, new overrides {len(overrides)}, new external {len(external)}, NO_PHOTO {len(no_photo)}, disagreements {len(disagree)}')
for d in disagree:
    print('  DISAGREE', d[0], '|', d[2][:90], '|', (d[3] or '')[:90])
for m in missing:
    print('  MISSING', m[0], m[1], '|', m[2][:110])
if WRITE:
    def set_in(block, k, line):
        global ov
        a_ = ov.index('export const ' + block); b_ = ov.index('\n};', a_); blk = ov[a_:b_]
        pat = re.compile(r'^  ' + re.escape(q(k)) + r': .*,$', re.M)
        blk = pat.sub(lambda m: line, blk, 1) if pat.search(blk) else blk + '\n' + line
        ov = ov[:a_] + blk + ov[b_:]
    for k, f in overrides.items():
        set_in('WIKI_IMAGE_OVERRIDES', k, f'  {q(k)}: {q(f)},')
    for k, v in subjects.items():
        set_in('PHOTO_SUBJECT', k, f'  {q(k)}: {{ ' + ', '.join(f'{c}: {v[c]}' for c in ('x', 'y', 'zoom') if c in v) + ' },')
    a_ = ov.index('export const NO_PHOTO'); b_ = ov.index(']);', a_); blk = ov[a_:b_]
    for k in no_photo:
        if f'  {q(k)},' not in blk:
            blk += f'  {q(k)},\n'
    ov = ov[:a_] + blk + ov[b_:]
    open('src/data/imageOverrides.ts', 'w').write(ov)
    EXT.update(external)
    json.dump(EXT, open('curation/act/lens/external.json', 'w'), indent=1, ensure_ascii=False)
    json.dump({'missing': missing, 'disagree': disagree}, open(f'curation/act/lens-spots/{region}/outcome.json', 'w'), indent=1, ensure_ascii=False)
    print('written')
