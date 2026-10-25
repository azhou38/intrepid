#!/usr/bin/env python3
"""The run ledger: what each stage of an expansion run has done, so the orchestrator reads a few lines instead of the
stage's files, and a rerun redoes only what failed or whose inputs changed (PIPELINES.md → "Lean runs").

  python3 scripts/curation/run-ledger.py status   <run-dir>
  python3 scripts/curation/run-ledger.py check    <run-dir> <stage> [--inputs f ...]       exit 0 = done and inputs unchanged
  python3 scripts/curation/run-ledger.py mark     <run-dir> <stage> done|failed|running [--inputs f ...] [--outputs f ...] [--summary "..."]
  python3 scripts/curation/run-ledger.py task     <run-dir> <stage> <task-id> done|failed|unresolved [--note "..."]
  python3 scripts/curation/run-ledger.py pending  <run-dir> <stage> <task-id> [<task-id> ...]   prints the ids not yet done
  python3 scripts/curation/run-ledger.py peek     <json-file> [--key k]                 counts, never the content
  python3 scripts/curation/run-ledger.py validate <kind> <json-file>                     kind: candidates | judge | research | evidence

The ledger is <run-dir>/run.json. A stage's input fingerprint is a hash of its input files' contents, so editing an input
(a new candidate list, a corrected placement) makes `check` report the stage stale. `task` records one shard, group or
spot inside a stage: a failed or unresolved task is rerun on its own, never its whole stage. `unresolved` is for work that
could not be done (a source blocked or rate-limited): it is an open error, not a result.
"""
import hashlib, json, os, sys, time

def load(run):
    p = os.path.join(run, 'run.json')
    return json.load(open(p)) if os.path.exists(p) else {'stages': {}}

def save(run, d):
    os.makedirs(run, exist_ok=True)
    p = os.path.join(run, 'run.json')
    json.dump(d, open(p + '.tmp', 'w'), indent=1, ensure_ascii=False)
    os.replace(p + '.tmp', p)

def fingerprint(files):
    h = hashlib.sha1()
    for f in sorted(files):
        h.update(f.encode())
        if os.path.isdir(f):
            for root, _, names in sorted(os.walk(f)):
                for n in sorted(names):
                    q = os.path.join(root, n)
                    h.update(q.encode()); h.update(open(q, 'rb').read())
        elif os.path.exists(f):
            h.update(open(f, 'rb').read())
        else:
            h.update(b'<missing>')
    return h.hexdigest()[:16]

def opt(args, flag):
    """Values after --flag up to the next --flag."""
    if flag not in args: return []
    i = args.index(flag) + 1; out = []
    while i < len(args) and not args[i].startswith('--'): out.append(args[i]); i += 1
    return out

def now(): return time.strftime('%Y-%m-%dT%H:%M:%S')

def status(run):
    d = load(run)
    if not d['stages']: print(f'{run}: no stages yet'); return
    for name, s in d['stages'].items():
        tasks = s.get('tasks', {})
        tc = {}
        for t in tasks.values(): tc[t['status']] = tc.get(t['status'], 0) + 1
        tline = (' tasks ' + ' '.join(f'{k}:{v}' for k, v in sorted(tc.items()))) if tc else ''
        print(f"{name:28} {s['status']:9} {s.get('updated', '')[5:16]}{tline}  {s.get('summary', '')}"[:200])

def peek(path, key=None):
    """A JSON file's shape and counts: lists by length, dicts by key count, and the tallies of common verdict fields."""
    d = json.load(open(path))
    if key:
        for k in key.split('.'): d = d[k] if isinstance(d, dict) else d[int(k)]
    def tally(items):
        out = {}
        for it in items:
            if not isinstance(it, dict): continue
            for f in ('verdict', 'status', 'action', 'choice'):
                v = it.get(f)
                if isinstance(v, str):
                    v = v.split(':')[0][:24]
                    out.setdefault(f, {}); out[f][v] = out[f].get(v, 0) + 1
        return out
    if isinstance(d, list):
        print(f'{path}: list of {len(d)}', json.dumps(tally(d))[:300])
    elif isinstance(d, dict):
        sizes = {k: (len(v) if isinstance(v, (list, dict)) else type(v).__name__) for k, v in list(d.items())[:20]}
        print(f'{path}: {len(d)} keys', json.dumps(sizes)[:300])
        vals = [v for v in d.values() if isinstance(v, dict)]
        if vals: print('  values:', json.dumps(tally(vals))[:300])
    else:
        print(f'{path}: {type(d).__name__}')

# Stage output contracts, checked by code instead of read by the orchestrator.
def validate(kind, path):
    d = json.load(open(path)); errs = []
    if kind == 'candidates':
        if not isinstance(d, dict): errs.append('not an object keyed by slot')
        else:
            for slot, cs in d.items():
                if slot.startswith('_'): continue
                if not isinstance(cs, list): errs.append(f'{slot}: not a list'); continue
                for i, c in enumerate(cs):
                    if not (c.get('file') or c.get('url') or c.get('local')): errs.append(f'{slot}[{i}]: no file, url or local')
                    if not c.get('page') and not c.get('file'): errs.append(f'{slot}[{i}]: no source page')
                    if not (c.get('licence') or c.get('license')): errs.append(f'{slot}[{i}]: no licence')
    elif kind == 'judge':
        for slot, v in d.items():
            if slot.startswith('_'): continue
            ch = v.get('choice') if isinstance(v, dict) else None
            if not isinstance(ch, str) or not ch: errs.append(f'{slot}: no choice')
    elif kind == 'research':
        spots = d.get('spots', d)
        for sid, s in spots.items():
            if sid.startswith('_') or not isinstance(s, dict): continue
            if not (s.get('free') is True or s.get('costMin') is not None): errs.append(f'{sid}: no cost and not free')
            if not s.get('costBasis'): errs.append(f'{sid}: no costBasis')
            if s.get('needs') == 'park-pass' and not s.get('parkPass'): errs.append(f'{sid}: park-pass without parkPass')
            if 'hours' in s or 'closedDays' in s: errs.append(f'{sid}: carries opening hours (spots have none)')
            if not s.get('ticketUrl') and not s.get('ticket_note'): errs.append(f'{sid}: no ticketUrl decision')
    elif kind == 'evidence':
        for sid, e in (d.get('spots') or {}).items():
            if not e.get('sources'): errs.append(f'{sid}: no sources')
    else:
        print(f'unknown kind {kind}'); sys.exit(1)
    print(f'{path}: {"ok" if not errs else str(len(errs)) + " problems"}')
    for e in errs[:30]: print('  ' + e)
    if len(errs) > 30: print(f'  … {len(errs) - 30} more')
    sys.exit(1 if errs else 0)

def main():
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    cmd = a[0]
    if cmd == 'status': status(a[1]); return
    if cmd == 'peek': peek(a[1], (opt(a, '--key') or [None])[0]); return
    if cmd == 'validate': validate(a[1], a[2]); return
    run, stage = a[1], a[2]
    d = load(run); s = d['stages'].setdefault(stage, {'status': 'todo'})
    if cmd == 'check':
        fp = fingerprint(opt(a, '--inputs'))
        if s['status'] == 'done' and s.get('inputs_fp') == fp:
            print(f'{stage}: done, inputs unchanged ({s.get("summary", "")})'[:200]); sys.exit(0)
        why = 'not done' if s['status'] != 'done' else 'inputs changed'
        print(f'{stage}: to do ({why})'); sys.exit(1)
    if cmd == 'mark':
        s['status'] = a[3]; s['updated'] = now()
        if opt(a, '--inputs'): s['inputs_fp'] = fingerprint(opt(a, '--inputs')); s['inputs'] = opt(a, '--inputs')
        if opt(a, '--outputs'): s['outputs'] = opt(a, '--outputs')
        if opt(a, '--summary'): s['summary'] = ' '.join(opt(a, '--summary'))[:160]
        save(run, d); print(f'{stage}: {a[3]}'); return
    if cmd == 'task':
        t = s.setdefault('tasks', {}).setdefault(a[3], {})
        t['status'] = a[4]; t['updated'] = now()
        if opt(a, '--note'): t['note'] = ' '.join(opt(a, '--note'))[:200]
        save(run, d); print(f'{stage}/{a[3]}: {a[4]}'); return
    if cmd == 'pending':
        tasks = s.get('tasks', {})
        todo = [t for t in a[3:] if tasks.get(t, {}).get('status') != 'done']
        print(' '.join(todo) if todo else '(none)'); return
    print(__doc__); sys.exit(1)

if __name__ == '__main__':
    main()
