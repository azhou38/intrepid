#!/usr/bin/env python3
"""Applies the second judge's accepted photos (curation/nz-rest/lens/judge-2-*.json) to src/data.

  python3 scripts/curation/apply-photos.py stage    # Commons accepts -> overrides/whyVisitPhotos/PHOTO_SUBJECT;
                                                    # non-Commons accepts -> assets/photos (+thumbs), pending.json
  (commit and push assets/photos)
  python3 scripts/curation/apply-photos.py link     # pending.json -> externalPhotos.json, pinned to the commit SHA

Slots: spot:<id> (photo key = wiki else name), dest:<id>:header (destination name), dest:<id>:why<N> (whyVisitPhotos[N-1]).
"""
import glob, io, json, os, re, subprocess, sys, unicodedata, importlib.util
from PIL import Image

spec = importlib.util.spec_from_file_location('br', 'scripts/curation/brighten.py')
br = importlib.util.module_from_spec(spec); spec.loader.exec_module(br)
STEPS = [120, 250, 500, 960, 1280, 1920]
REPO_RAW = 'https://raw.githubusercontent.com/azhou38/intrepid'
PENDING = 'curation/nz-rest/lens/photos-pending.json'
mode = sys.argv[1]
SCRATCH = '/private/tmp/claude-501/-Users-alexzhou-Developer-mobile-wellington/16edc52c-57b1-4c22-8c60-6565c530b9eb/scratchpad'


def jq(s): return json.dumps(s, ensure_ascii=False)


def slugify(k):
    k = ''.join(c for c in unicodedata.normalize('NFKD', k) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', k.lower()).strip('-')[:70]


if mode == 'link':
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    ext = json.load(open('src/data/externalPhotos.json'))
    for p in json.load(open(PENDING)):
        ow = p['ow']
        ext[p['key']] = {'t': f"{REPO_RAW}/{sha}/assets/photos/thumbs/{p['slug']}-{{w}}.jpg",
                         'o': f"{REPO_RAW}/{sha}/assets/photos/{p['slug']}.jpg", 'ow': ow, 'credit': p['credit']}
    json.dump(ext, open('src/data/externalPhotos.json', 'w'), indent=1, ensure_ascii=False)
    print('linked', len(json.load(open(PENDING))), 'at', sha); sys.exit()

spots = open('src/data/spots.ts').read()
dest = open('src/data/destinations.ts').read()
ov = open('src/data/imageOverrides.ts').read()
ext = json.load(open('src/data/externalPhotos.json'))
cands = {}
for f in glob.glob('curation/nz-rest/lens/search-C*-candidates.json'):
    d = json.load(open(f))
    for slot, v in (d.items() if isinstance(d, dict) else [(x['slot'], x) for x in d]):
        cands[slot] = v


def spot_key(sid):
    m = re.search(r"\{ id: ['\"]%s['\"],[^\n]*" % re.escape(sid), spots)
    if not m: return None
    l = m.group(0)
    w = re.search(r'\bwiki: (?:"([^"]*)"|\'([^\']*)\')', l)
    if w: return w.group(1) or w.group(2)
    n = re.search(r'\bname: (?:"([^"]*)"|\'([^\']*)\')', l)
    return n.group(1) or n.group(2)


def set_in(block_name, key, line_val):
    global ov
    a = ov.index('export const ' + block_name); b = ov.index('\n};', a); blk = ov[a:b]
    kk = jq(key); pat = re.compile(r'^  ' + re.escape(kk) + r': .*,$', re.M)
    blk = pat.sub(lambda m: f'  {kk}: {line_val},', blk, 1) if pat.search(blk) else blk + f'\n  {kk}: {line_val},'
    ov = ov[:a] + blk + ov[b:]


pending, report = [], {'copyright_risk': [], 'unresolved': [], 'applied': 0}
for f in sorted(glob.glob(os.environ.get('JUDGE_GLOB', 'curation/nz-rest/lens/judge-2-C*.json'))):   # JUDGE_GLOB limits a run to one region's verdicts
    for r in json.load(open(f)):
        slot, acc = r['slot'], r['accept']
        if acc == 'none': continue
        if slot.startswith('spot:'): key = spot_key(slot[5:])
        elif slot.endswith(':header'):
            m = re.search(r"id: '%s', name: '([^']*)'" % re.escape(slot.split(':')[1]), dest); key = m and m.group(1)
        else: key = None   # why-visit handled below
        why = re.match(r'dest:([^:]+):why(\d)$', slot)
        if not key and not why:
            report['unresolved'].append((slot, 'spot not in src/data (not added)')); continue
        local = acc if acc.startswith('/') else None
        if not local and (acc.startswith('http') or acc.startswith('external')):
            c = cands.get(slot, {}); 
            for cd in (c.get('candidates') or []):
                if cd.get('page') == r.get('page') or cd.get('file') == acc or cd.get('url') == acc:
                    local = cd.get('local_path') or cd.get('local')
        if not local and r.get('source') not in (None, 'commons') and '/' not in acc:
            hits = glob.glob(os.path.join(SCRATCH, '**', acc), recursive=True)
            local = hits[0] if hits else None
        non_commons = bool(local) or r.get('source') not in (None, 'commons')
        hc = r.get('hero_crop')
        if non_commons:
            if not local or not os.path.exists(local):
                report['unresolved'].append((slot, f'no local file for {acc[:60]}')); continue
            img = Image.open(local).convert('RGB')
            cap = 1920
            if img.width > cap: img = img.resize((cap, round(img.height * cap / img.width)), Image.LANCZOS)
            if r.get('needs_brighten'):
                img = br.lift(img, br.choose_gamma(img))
            k = key if key else f"File:ext-{slugify(slot)}.jpg"
            s = slugify(k.replace('File:', ''))
            os.makedirs('assets/photos/thumbs', exist_ok=True)
            img.save(f'assets/photos/{s}.jpg', quality=88, optimize=True, progressive=True)
            for w in [w for w in STEPS if w < img.width] + [img.width]:
                t = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS) if w < img.width else img
                t.save(f'assets/photos/thumbs/{s}-{w}.jpg', quality=80, optimize=True, progressive=True)
            pending.append({'key': k, 'slug': s, 'ow': img.width,
                            'credit': {'by': r.get('author') or 'unknown', 'license': r.get('licence') or 'unknown', 'page': r.get('page') or ''}})
            if why:
                m = re.search(r"id: '%s',.*?whyVisitPhotos: \[(.*?)\]" % re.escape(why.group(1)), dest, re.S)
                arr = re.findall(r'"([^"]*)"', m.group(1)); arr[int(why.group(2)) - 1] = k.replace('File:', '')
                new = 'whyVisitPhotos: [' + ', '.join(jq(a) for a in arr) + ']'
                dest = dest[:m.start()] + re.sub(r'whyVisitPhotos: \[.*?\]', lambda _: new, dest[m.start():m.end()], 1, flags=re.S) + dest[m.end():]
            ext.pop(k, None)   # the new external entry is written by `link`
            if key and isinstance(hc, dict): set_in('PHOTO_SUBJECT', k, '{ ' + ', '.join(f'{a}: {hc[a]}' for a in ('x', 'y', 'zoom') if hc.get(a) is not None) + ' }')
            if key: ov = re.sub(r'^  ' + re.escape(jq(k)) + r': "[^"]*",\n', '', ov, flags=re.M) if False else ov
        else:
            fn = re.sub(r'^File:', '', acc)
            if why:
                m = re.search(r"id: '%s',.*?whyVisitPhotos: \[(.*?)\]" % re.escape(why.group(1)), dest, re.S)
                arr = re.findall(r'"([^"]*)"', m.group(1)); arr[int(why.group(2)) - 1] = fn
                new = 'whyVisitPhotos: [' + ', '.join(jq(a) for a in arr) + ']'
                dest = dest[:m.start()] + re.sub(r'whyVisitPhotos: \[.*?\]', lambda _: new, dest[m.start():m.end()], 1, flags=re.S) + dest[m.end():]
            else:
                set_in('WIKI_IMAGE_OVERRIDES', key, jq(fn))
                ext.pop(key, None)
                if isinstance(hc, dict): set_in('PHOTO_SUBJECT', key, '{ ' + ', '.join(f'{a}: {hc[a]}' for a in ('x', 'y', 'zoom') if hc.get(a) is not None) + ' }')
            if r.get('needs_brighten'): report.setdefault('brighten_commons', []).append(key or fn)
        if r.get('copyright_risk'): report['copyright_risk'].append((slot, r.get('page')))
        report['applied'] += 1

open('src/data/imageOverrides.ts', 'w').write(ov); open('src/data/destinations.ts', 'w').write(dest)
json.dump(ext, open('src/data/externalPhotos.json', 'w'), indent=1, ensure_ascii=False)
json.dump(pending, open(PENDING, 'w'), indent=1, ensure_ascii=False)
json.dump(report, open('curation/nz-rest/lens/photos-report.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: (v if isinstance(v, int) else len(v)) for k, v in report.items()}), 'pending external:', len(pending))
for u in report['unresolved']: print('UNRESOLVED', u)
