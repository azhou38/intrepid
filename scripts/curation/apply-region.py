#!/usr/bin/env python3
"""Applies one region's finished curation to src/data: Atlas's placement, Quill's final copy, Lens's accepted photos.

  python3 scripts/curation/apply-region.py <region-id> [--dry-run] [--only id,id] [--evidence <folder>] [--currency XXX]

Works for any region in scripts/coverage-regions.json, any country, any branch. The evidence folder is found by looking for
curation/*/region-<id>/ (pass --evidence curation/<folder> if two folders hold the same region); the standalone-spot defaults
(country, code, continent, timezone) and the currency come from the region's country in COUNTRY_DEFAULTS below, with an
optional "timezone" and/or "currency" on the region's own entry in coverage-regions.json (Tasmania is Australia/Hobart).

Reads <evidence>/region-<id>/placement.json (any of the keys `placements | places | spots | new_spots`) and
<evidence>/quill/<id>/final.json (`spots`, `existing_fixes`, `held`). Adds, through apply-placement.py, every placed
spot of an EXISTING destination (or standalone) that has: a Quill entry, an accepted Commons photo (not held, not external),
and is not a spot of a proposed destination. Everything else is listed with its reason, never added. Then applies
`existing_fixes` to existing spots (fields) and destinations (description etc.), and records `hero_crop` as PHOTO_SUBJECT.
"""
import json, os, re, subprocess, sys, tempfile

args = sys.argv[1:]
if not args or args[0].startswith('--'):
    sys.exit(__doc__)
region = args[0]
dry = '--dry-run' in args
photoless = '--photoless' in args   # a missing photo never holds a spot back (IMAGES.md); holds with another reason stay
only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None

# ---- where this region's evidence lives, and what country it is in ------------------------------------------------------
import glob
if '--evidence' in args:
    EVID = f"{args[args.index('--evidence') + 1].rstrip('/')}/region-{region}"
else:
    found = sorted({os.path.dirname(f) for f in glob.glob(f'curation/*/region-{region}/placement.json') + glob.glob(f'curation/*/region-{region}/apply-placement.json')})
    if not found:
        sys.exit(f'no curation/*/region-{region}/placement.json: run the region first, or pass --evidence curation/<folder>')
    if len(found) > 1:
        sys.exit(f'region {region} has evidence in {len(found)} folders ({", ".join(found)}): pass --evidence curation/<folder> (the folder that holds region-{region}/)')
    EVID = found[0]
REG = json.load(open('scripts/coverage-regions.json'))
region_entry, region_cc = None, None
for cc, lst in REG.items():
    if cc.startswith('_'):
        continue
    for r in lst:
        if r['id'] == region:
            region_entry, region_cc = r, cc
if not region_entry:
    sys.exit(f'region {region} is not in scripts/coverage-regions.json')
# Country defaults for standalone spots and costs. Add a country here when its first region is run (COVERAGE.md → new country checklist).
COUNTRY_DEFAULTS = {
    'NZ': {'country': 'New Zealand', 'countryCode': 'NZ', 'continent': 'Oceania', 'timezone': 'Pacific/Auckland', 'currency': 'NZD'},
    'AU': {'country': 'Australia', 'countryCode': 'AU', 'continent': 'Oceania', 'timezone': 'Australia/Sydney', 'currency': 'AUD'},
    'PG': {'country': 'Papua New Guinea', 'countryCode': 'PG', 'continent': 'Oceania', 'timezone': 'Pacific/Port_Moresby', 'currency': 'PGK'},
}
if region_cc not in COUNTRY_DEFAULTS:
    sys.exit(f'no COUNTRY_DEFAULTS for {region_cc}: add its country, continent, timezone and currency to apply-region.py')
_cd = {**COUNTRY_DEFAULTS[region_cc], **{k: region_entry[k] for k in ('timezone', 'currency') if k in region_entry}}
currency = args[args.index('--currency') + 1] if '--currency' in args else _cd['currency']
non_photo_holds_path = os.path.join(os.path.dirname(EVID), 'non-photo-holds.json')
non_photo_holds = set(json.load(open(non_photo_holds_path))) if os.path.exists(non_photo_holds_path) else set()

_flat = f'{EVID}/apply-placement.json'   # scripts/curation/build-apply-placement.py writes a flat list from Quill's final copy
place = json.load(open(_flat if os.path.exists(_flat) else f'{EVID}/placement.json'))
key = next(k for k in ('placements', 'places', 'spots', 'new_spots', 'placed') if k in place)
final_path = f'{os.path.dirname(EVID)}/quill/{region}/final.json'
final = json.load(open(final_path)) if os.path.exists(final_path) else {'spots': {}, 'existing_fixes': {}, 'held': []}
held_ids = {h if isinstance(h, str) else (h.get('id') or h.get('key') or h.get('name')) for h in (final.get('held') or [])}
dest_src = open('src/data/destinations.ts').read()
dest_ids = set(re.findall(r"^\s*id: '([a-z0-9-]+)', name: ", dest_src, re.M))

STANDALONE_DEFAULT = {k: _cd[k] for k in ('country', 'countryCode', 'continent', 'timezone')}
FIELDS = ['name', 'wiki', 'icon', 'category', 'bio', 'visitHoursMin', 'visitHoursMax', 'free', 'costMin', 'costMax',
          'currency', 'costBasis', 'costPer', 'needs', 'ticketUrl']

# Ids are assigned per region by the placement agents, which did not know about each other: two regions can both have
# handed out `tongariro-7`. Keep an id if it is free, otherwise take the destination's next number (ids are never reused,
# so the count comes from spots.ts and git history).
_spots_now = open('src/data/spots.ts').read()
_hist = subprocess.run("git log -p -- src/data/spots.ts | grep -o \"id: ['\\\"][a-z0-9-]*['\\\"]\"", shell=True, capture_output=True, text=True).stdout
_used = set(re.findall(r"id: ['\"]([^'\"]+)['\"]", _spots_now + '\n' + _hist))
_claimed = set()


def free_id(sid, dest):
    if sid not in _used and sid not in _claimed:
        _claimed.add(sid); return sid
    m = re.fullmatch(re.escape(dest) + r'-(\d+)', sid or '') if dest else None
    if not m:
        raise SystemExit(f'id {sid} is taken and is not a numbered {dest} id: pick another by hand')
    n = max([int(x) for x in re.findall(re.escape(dest) + r'-(\d+)', ' '.join(_used | _claimed))] or [0]) + 1
    new_id = f'{dest}-{n}'
    _claimed.add(new_id)
    print(f'  renumber {sid} -> {new_id} (taken by an earlier region)')
    return new_id


norm, skipped = [], []
for e in place[key]:
    sid, name = e.get('id'), e.get('name')
    c = e.get('coordinates')
    if isinstance(c, dict) and 'lat' in c:   # a placement written with lat/lng (Tasmania's) → latitude/longitude
        e['coordinates'] = {'latitude': c['lat'], 'longitude': c['lng']}
    if only and sid not in only:
        continue
    act = e.get('action')
    if act not in ('spot', 'standalone'):
        skipped.append((sid, name, f'action {act}: waits on its proposed destination')); continue
    st = str(e.get('status') or '')
    if ('held' in st or sid in held_ids) and not (photoless and sid not in non_photo_holds):
        skipped.append((sid, name, 'held: ' + (st or 'see final.json'))); continue
    ph = e.get('photo') or {}
    # A photo the skeptic or enumerator merely proposed is NOT applied: only a photo the image-judge accepted (photo_verdict 'accept', set
    # by the Lens judges) goes in. Turangi shipped a riverbank as a town's photo because proposed photos were applied unjudged.
    nophoto = not ph.get('file') or ph.get('external') or e.get('photo_verdict') != 'accept'
    if nophoto and not photoless:
        skipped.append((sid, name, 'no accepted Commons photo' + (' (external photo not yet committed)' if ph.get('external') else ''))); continue
    q = final['spots'].get(sid)
    if not q:
        skipped.append((sid, name, 'no Quill entry (research/copy not done)')); continue
    if act == 'spot' and e.get('destination') not in dest_ids:
        skipped.append((sid, name, f"destination {e.get('destination')} is not in the app")); continue
    spot = {k: q[k] for k in FIELDS if k in q and q[k] is not None}
    spot.setdefault('name', name)
    if q.get('free') is not True:
        spot.pop('free', None)
    if act == 'standalone':
        for k, v in STANDALONE_DEFAULT.items():
            spot[k] = q.get(k, v)
    missing = [k for k in ('icon', 'category', 'bio', 'visitHoursMin', 'visitHoursMax') if k not in spot]
    if missing:
        skipped.append((sid, name, f'Quill entry lacks {missing}')); continue
    if not (spot.get('free') or spot.get('costMin') is not None):
        skipped.append((sid, name, 'no cost and not free (needs_owner)')); continue
    new_sid = free_id(sid, e.get('destination') if act == 'spot' else None) if not dry else sid
    entry = {'id': new_sid, 'name': name, 'action': act, 'destination': e.get('destination') if act == 'spot' else None,
             'coordinates': q.get('coordinates') or e.get('coordinates'),
             'photo': {'file': re.sub(r'^File:', '', ph['file'])} if not nophoto else None, 'photoless': nophoto, 'photo_verdict': 'accept', 'spot': spot}
    hc = e.get('hero_crop') or ph.get('hero_crop')
    if isinstance(hc, dict) and not nophoto:
        entry['photo']['hero_crop'] = hc
    if not entry['coordinates']:
        skipped.append((sid, name, 'no coordinates')); continue
    _dec = lambda v: len(str(v).split('.')[1]) if '.' in str(v) else 0
    if '--allow-round' not in args and _dec(entry['coordinates']['latitude']) <= 3 and _dec(entry['coordinates']['longitude']) <= 3:
        skipped.append((sid, name, 'round coordinates: a memory pin. Run scripts/curation/resolve-pin.py and use a real point (or --allow-round)')); continue
    norm.append(entry)

print(f'{region}: {len(norm)} spots ready to add; {len(skipped)} not added')
for s in skipped:
    print('  skip', s)

if norm:
    tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, dir='.cache' if os.path.isdir('.cache') else None)
    json.dump({'placements': norm}, tmp, ensure_ascii=False)
    tmp.close()
    cmd = ['python3', 'scripts/curation/apply-placement.py', tmp.name, '--currency', currency] + (['--dry-run'] if dry else [])
    print(subprocess.run(cmd, capture_output=True, text=True).stdout)
    os.unlink(tmp.name)

# ---- existing fixes ------------------------------------------------------------------------------------------------

def q(s):
    return json.dumps(s, ensure_ascii=False)


def entry_span(src, sid):
    m = re.search(r"\{ id: ['\"]" + re.escape(sid) + r"['\"]", src)
    if not m:
        return None
    i, depth, instr, esc = m.start(), 0, None, False
    for j in range(i, len(src)):
        c = src[j]
        if instr:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == instr: instr = None
            continue
        if c in '"\'`': instr = c
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i, j + 1
    return None


STR = r'("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')'


def set_field(text, k, v):
    """Set, replace or (v is None) remove a field in one entry's text."""
    pat = {
        'str': re.compile(r'\b' + k + r': ' + STR),
        'num': re.compile(r'\b' + k + r': -?[\d.]+'),
        'bool': re.compile(r'\b' + k + r': (?:true|false)'),
        'coord': re.compile(r'\b' + k + r': \{[^}]*\}'),
    }
    if k == 'coordinates':
        kind, lit = 'coord', f"coordinates: {{ latitude: {v['latitude']}, longitude: {v['longitude']} }}" if v else None
    elif k in ('visitHoursMin', 'visitHoursMax', 'costMin', 'costMax'):
        kind, lit = 'num', f'{k}: {v}' if v is not None else None
    elif k == 'free':
        kind, lit = 'bool', 'free: true' if v else None
    else:
        kind, lit = 'str', f'{k}: {q(v)}' if v is not None else None
    rx = pat[kind]
    if rx.search(text):
        if lit is None:
            return re.sub(r',?\s*' + rx.pattern, '', text, count=1)
        return rx.sub(lambda m: lit, text, count=1)
    if lit is None:
        return text
    return re.sub(r'\s*\}$', f', {lit} }}', text.rstrip())


fixes = final.get('existing_fixes') or {}
if isinstance(fixes, list):
    fixes = {}
spots_src = open('src/data/spots.ts').read()
dest_text = dest_src
changed = []
for sid, fx in fixes.items():
    if only and sid not in only:
        continue
    if sid in dest_ids:      # a destination: description etc.
        m = re.search(r"\{\s*\n\s*id: '" + re.escape(sid) + r"'", dest_text)
        if not m:
            changed.append((sid, 'destination entry not found')); continue
        i, depth, instr, esc = m.start(), 0, None, False
        for j in range(i, len(dest_text)):
            c = dest_text[j]
            if instr:
                if esc: esc = False
                elif c == '\\': esc = True
                elif c == instr: instr = None
                continue
            if c in '"\'`': instr = c
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    end = j + 1; break
        text = dest_text[i:end]
        for k, v in fx.items():
            if k in ('description', 'tagline') and isinstance(v, str):
                rx = re.compile(r'\b' + k + r': ' + STR)
                if rx.search(text):
                    text = rx.sub(lambda m: f'{k}: {q(v)}', text, count=1)
                    changed.append((sid, k))
        dest_text = dest_text[:i] + text + dest_text[end:]
        continue
    span = entry_span(spots_src, sid)
    if not span:
        changed.append((sid, 'spot not found')); continue
    i, j = span
    text = spots_src[i:j]
    _old_key = None
    if 'wiki' in fx or 'name' in fx:
        mw = re.search(r"\bwiki: " + STR, text); mn = re.search(r"\bname: " + STR, text)
        _old_key = json.loads(('"' + (mw or mn).group(1)[1:-1].replace('"', '\\"') + '"')) if (mw or mn) else None
    for k, v in fx.items():
        if k in ('notes', 'note', 'source'):
            continue
        if k == 'remove':
            for f in (v if isinstance(v, list) else [v]):
                text = set_field(text, f, None); changed.append((sid, f'{f} removed'))
            continue
        if k == 'wiki' and v is None:
            text = set_field(text, 'wiki', None); changed.append((sid, 'wiki removed')); continue
        if k == 'free' and v is False:
            text = set_field(text, 'free', None); changed.append((sid, 'free removed')); continue
        if k in FIELDS + ['coordinates']:
            text = set_field(text, k, v); changed.append((sid, k))
    spots_src = spots_src[:i] + text + spots_src[j:]
    # A new wiki title or name moves the spot's photo key (spotPhotoTitle: wiki, else name): copy any override and subject
    # point from the old key to the new one, so the spot keeps the photo a judge accepted.
    if _old_key and not dry:
        mw = re.search(r"\bwiki: " + STR, text); mn = re.search(r"\bname: " + STR, text)
        _src = (mw or mn).group(1)
        _new_key = json.loads('"' + _src[1:-1].replace('"', '\\"') + '"') if _src[0] == '"' else _src[1:-1]
        if _new_key != _old_key:
            io = open('src/data/imageOverrides.ts').read()
            moved = []
            for blk in ('export const WIKI_IMAGE_OVERRIDES', 'export const PHOTO_SUBJECT'):
                a = io.index(blk); b = io.index('};', a)
                part = io[a:b]
                m = re.search(r'^  ' + re.escape(q(_old_key)) + r': (.*),$', part, re.M)
                if m and not re.search(r'^  ' + re.escape(q(_new_key)) + r':', part, re.M):
                    part += f'  {q(_new_key)}: {m.group(1)},\n'; moved.append(blk.split()[-1])
                    io = io[:a] + part + io[b:]
            open('src/data/imageOverrides.ts', 'w').write(io)
            ext = json.load(open('src/data/externalPhotos.json'))
            if _old_key in ext and _new_key not in ext:
                ext[_new_key] = ext[_old_key]; moved.append('externalPhotos')
                json.dump(ext, open('src/data/externalPhotos.json', 'w'), indent=1, ensure_ascii=False); open('src/data/externalPhotos.json', 'a').write('\n')
            if moved:
                changed.append((sid, f'photo key {_old_key!r} -> {_new_key!r}: copied {moved}'))

print(f'existing fixes: {len(changed)} field changes')
for c in changed:
    print('  ', c)
if not dry:
    open('src/data/spots.ts', 'w').write(spots_src)
    open('src/data/destinations.ts', 'w').write(dest_text)
