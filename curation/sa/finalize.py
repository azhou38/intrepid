#!/usr/bin/env python3
"""Per region: applies the judges' audit overrides to verdicts.json and lists what the resolver pass must read.
  python3 curation/sa/finalize.py base <region-id>...      writes verdicts.base.json (a copy, once), applies audited.json and
                                                           audited-full.json (the judge's verdict wins over the script's), and
                                                           writes resolve-in.json: every review plus every reject whose reason
                                                           says a source or page was missing or unread
  python3 curation/sa/finalize.py resolved <region-id>...  applies resolved.json (the resolver's verdicts) and writes verdicts.json
"""
import json, os, re, shutil, sys
mode, regions = sys.argv[1], sys.argv[2:]
THIN = re.compile(r"no counted source|404|not found|returned no|no usable|did not open|only (a )?wikipedia|(one|single) (counted )?source|does not mention|could not (load|be)|rests on", re.I)
for r in regions:
    d = f'curation/sa/region-{r}'
    if mode == 'base':
        if not os.path.exists(f'{d}/verdicts.base.json'):
            shutil.copy(f'{d}/verdicts.json', f'{d}/verdicts.base.json')
        v = json.load(open(f'{d}/verdicts.base.json'))
        by = {e['name']: e for e in v}
        n = 0
        for f in ('audited.json', 'audited-full.json'):
            if os.path.exists(f'{d}/{f}'):
                for a in json.load(open(f'{d}/{f}')):
                    e = by.get(a['name'])
                    if e and a['verdict'] != e['verdict']:
                        e['verdict'], e['reason'], e['decided_by'] = a['verdict'], a.get('reason', ''), f'audit override ({f})'; n += 1
        cands = {c['name']: c for c in json.load(open(f'{d}/candidates.json'))}
        todo = []
        for e in v:
            if e['verdict'] == 'review' or (e['verdict'] == 'reject' and THIN.search(e.get('reason') or '') and e.get('decided_by', '').startswith('judge')):
                todo.append({'name': e['name'], 'was': e['verdict'], 'reason': e.get('reason'), 'candidate': cands.get(e['name'])})
        json.dump(v, open(f'{d}/verdicts.json', 'w'), indent=1, ensure_ascii=False)
        json.dump(todo, open(f'{d}/resolve-in.json', 'w'), indent=1, ensure_ascii=False)
        c = {k: sum(1 for e in v if e['verdict'] == k) for k in ('keep', 'reject', 'review')}
        print(r, c, f'{n} audit overrides;', len(todo), 'for the resolver (', sum(1 for t in todo if t['was'] == 'review'), 'review +', sum(1 for t in todo if t['was'] == 'reject'), 'thin rejects )')
    else:
        v = json.load(open(f'{d}/verdicts.json')); by = {e['name']: e for e in v}
        n = 0
        for a in json.load(open(f'{d}/resolved.json')):
            e = by.get(a['name'])
            if e:
                e['verdict'], e['reason'], e['decided_by'] = a['verdict'], a.get('reason', ''), 'resolver'; e['resolver_source'] = a.get('source'); n += 1
        json.dump(v, open(f'{d}/verdicts.json', 'w'), indent=1, ensure_ascii=False)
        c = {k: sum(1 for e in v if e['verdict'] == k) for k in ('keep', 'reject', 'review')}
        print(r, c, n, 'resolved')
