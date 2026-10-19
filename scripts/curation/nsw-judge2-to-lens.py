#!/usr/bin/env python3
"""Converts an NSW region's blind second-judge verdicts into the list apply-photos.py reads
(curation/nz-rest/lens/judge-2-C-nsw-<region>.json): [{slot, accept, page, source, licence, hero_crop, needs_brighten, author, copyright_risk}].
`accept` is the Commons file name, the local path of a downloaded non-Commons photo, or 'none'.

  python3 scripts/curation/nsw-judge2-to-lens.py <region-id>...
"""
import json, sys
d = 'curation/nz-rest/lens-nsw'
for r in sys.argv[1:]:
    task = {s['slot']: s for s in json.load(open(f'{d}/{r}.second-task.json'))['slots']}
    j2 = json.load(open(f'{d}/{r}.judge-2.json'))['slots']
    j1 = json.load(open(f'{d}/{r}.judge-1.json'))['slots']
    base = {s['slot']: s for s in json.load(open(f'{d}/{r}.task.json'))['slots']}
    out = []
    # slots the second judge did not see: the first judge's accept stands
    for slot, v in j1.items():
        if slot in j2 or v.get('decision') != 'accept' or not (base.get(slot) or {}).get('candidate'):
            continue
        hc = v.get('hero_crop')
        out.append({'slot': slot, 'accept': base[slot]['candidate']['file'], 'page': base[slot]['candidate'].get('page'), 'source': 'commons',
                    'licence': v.get('licence') or base[slot]['candidate'].get('licence'), 'hero_crop': hc if isinstance(hc, dict) else None,
                    'needs_brighten': bool(v.get('dark')), 'copyright_risk': False, 'weak': bool(v.get('weak')), 'judged': 'first-only'})
    for slot, v in j2.items():
        ch = v.get('choice') or 'none'
        if ch.startswith('none'):
            out.append({'slot': slot, 'accept': 'none', 'why': ch}); continue
        opt = next((o for o in task[slot]['options'] if o['file_or_url'] == ch), None)
        if not opt:
            out.append({'slot': slot, 'accept': 'none', 'why': f'choice {ch!r} not among the options'}); continue
        commons = opt.get('tier') == 'commons'
        hc = v.get('hero_crop')
        out.append({'slot': slot, 'accept': ch if commons else (opt.get('local') or ch), 'page': opt.get('page'),
                    'source': 'commons' if commons else 'external', 'licence': v.get('licence') or opt.get('licence'),
                    'author': opt.get('credit'), 'hero_crop': hc if isinstance(hc, dict) else None,
                    'needs_brighten': bool(v.get('dark')), 'copyright_risk': bool(v.get('copyright_risk') or opt.get('copyright_risk')),
                    'weak': bool(v.get('weak'))})
    json.dump(out, open(f'curation/nz-rest/lens/judge-2-C-nsw-{r}.json', 'w'), indent=1, ensure_ascii=False)
    print(r, len(out), 'slots,', sum(1 for o in out if o['accept'] == 'none'), 'none,', sum(1 for o in out if o.get('source') == 'external'), 'external')
