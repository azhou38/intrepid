#!/usr/bin/env python3
"""Lens second judge, batched across a run's groups, with the mechanical checks done by script first (PIPELINES.md →
Pipeline B step 4). The blind second judge then only does what needs eyes: right place, the thing itself, a real photo.

  python3 scripts/curation/second-judge.py build <lens-dir> [--size 35]
  python3 scripts/curation/second-judge.py split <lens-dir>

build: for every group under <lens-dir> (a folder with task.json, candidates.json, judge-1.json; also candidates-search.json
and judge-1-search.json when the searcher's finds were judged), takes the slots where the first judge chose a NEW file and
checks every candidate of those slots, never telling the second judge which one the first judge chose:
  size      width under the slot's floor (header 1500, why-visit 1280, spot 960), or a header outside aspect 0.6–2.0 → fail
  licence   NC, all rights reserved, or no licence → fail
  in use    the same file is already another spot's photo → fail; a destination's header or why-visit photo → note only
            (sharing within one destination is allowed: IMAGES.md → "Why visit photos")
  bright    centre-square 40th percentile < 0.22 or mean < 0.30 → note (the reconciler brightens it)
  crop      share of the photo a square (or a 1.6:1 why-visit card) shows → note, and the crop is drawn on the sheet
Writes <lens-dir>/second/precheck.json (every candidate's results), second/sheets/<group>__<slot>.jpg (each passing
candidate: whole photo beside the crop the app shows), second/batch-NN.json (the slots, about --size per batch, across
groups; one second judge per batch) and second/auto-none.json (slots where no candidate passes: no judge needed).

split: reads the judges' second/batch-NN.out.json ({"<group>|<slot>": {choice, candidates, …}}) plus auto-none.json and
merges them into each group's judge-2.json, the file record-verdicts.ts and the reconciler already read.
Batch size: a judge's cost is mostly its fixed start (reading the rules and files), so 33 slots cost about the same as 10
on Tonga (58k vs 71k tokens). Keep --size at 30–40; more than about 40 slots makes one agent's turns long.
"""
import glob, json, os, re, sys
from PIL import Image, ImageDraw

MIN_W = {'header': 1500, 'why': 1280, 'spot': 960}
FLOOR_P40, FLOOR_MEAN = 0.22, 0.30


def kind(slot):
    return 'header' if slot.endswith(':header') else 'why' if ':why' in slot else 'spot'


def load(path, default=None):
    if not os.path.exists(path): return default
    d = json.load(open(path))
    return d.get('slots', d) if isinstance(d, dict) else d


def new_file_choice(v):
    if not isinstance(v, dict): return None
    c = str(v.get('choice') or '')
    if not c or c.startswith('none') or c == 'keep-current' or v.get('decision') in ('reject', 'none', 'keep-current'): return None
    return c


def licence_check(c):
    lic = str(c.get('licence') or '').strip()
    if not lic: return 'fail', lic, 'no licence recorded'
    if re.search(r'\bNC\b|non-?commercial', lic, re.I): return 'fail', lic, 'non-commercial licence'
    if re.search(r'all rights reserved', lic, re.I): return 'fail', lic, 'all rights reserved'
    return 'pass', lic, 'licence as recorded'


def in_use_index():
    """file → [keys] for every photo the app already uses, and the destinations' names (their keys may share)."""
    idx, dest_names = {}, set(re.findall(r"id: '[^']+', name: \"([^\"]+)\"", open('src/data/destinations.ts').read()))
    ov = open('src/data/imageOverrides.ts').read()
    for k, f in re.findall(r'^\s*"([^"]+)":\s*"([^"]+\.(?:jpe?g|png|tiff?|webp))"', ov, re.M | re.I):
        idx.setdefault(f.replace('_', ' '), []).append(k)
    for k, v in json.load(open('src/data/externalPhotos.json')).items():
        idx.setdefault(os.path.basename(str(v.get('o') or '')), []).append(k)
    for line in re.findall(r'whyVisitPhotos:\s*\[([^\]]*)\]', open('src/data/destinations.ts').read()):
        for f in re.findall(r'"([^"]+)"', line):
            idx.setdefault(f.replace('_', ' '), []).append('File:' + f)
    return idx, dest_names


def image_of(c):
    for p in (c.get('local'), c.get('file'), c.get('thumb')):
        if p and os.path.exists(str(p)):
            try:
                im = Image.open(p); im.load(); return im.convert('RGB')
            except Exception:
                pass
    return None


def brightness(im):
    g = im.convert('L'); w, h = g.size; s = min(w, h)
    px = sorted(g.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((96, 96)).getdata())
    return px[int(len(px) * 0.4)] / 255, sum(px) / len(px) / 255


def crop_box(w, h, k):
    r = 1.6 if k == 'why' else 1.0
    if w / h > r: cw, ch = h * r, h
    else: cw, ch = w, w / r
    return (w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2, (cw * ch) / (w * h)


def check(c, k, idx, dest_names, key):
    res = {'n': c.get('n'), 'file': c.get('file') or c.get('url'), 'fails': [], 'notes': []}
    im = image_of(c)
    w = c.get('width') or (im.size[0] if im else None)
    h = c.get('height') or (im.size[1] if im else None)
    if not w or not h: res['fails'].append('size unknown')
    else:
        if w < MIN_W[k]: res['fails'].append(f'{w} px wide, under {MIN_W[k]} for a {k}')
        if k == 'header' and not 0.6 <= w / h <= 2.0: res['fails'].append(f'aspect {w / h:.2f} outside 0.6–2.0')
    st, lic, why = licence_check(c)
    res['licence'] = lic
    (res['fails'] if st == 'fail' else res['notes']).append(f'licence: {why}')
    base = os.path.basename(str(res['file']).split('?')[0]).replace('_', ' ')
    for other in idx.get(base, []):
        if other == key: continue
        if other in dest_names or other.startswith('File:'): res['notes'].append(f'already used by {other} (allowed only within its destination)')
        else: res['fails'].append(f'already the photo of {other}')
    if im:
        p40, mean = brightness(im)
        res['bright'] = [round(p40, 2), round(mean, 2)]
        if p40 < FLOOR_P40 or mean < FLOOR_MEAN: res['notes'].append('below the brightness floor: will be brightened')
        x0, y0, x1, y1, share = crop_box(*im.size, k)
        res['crop_share'] = round(share, 2)
        if share < 0.6: res['notes'].append(f'the card shows {share:.0%} of the photo: check the subject is in the crop')
    else:
        res['notes'].append('no local image: brightness and crop not measured')
    res['status'] = 'fail' if res['fails'] else 'pass'
    return res, im


def sheet(rows, k, path):
    tiles = []
    for r, im in rows:
        t = Image.new('RGB', (760, 330), 'white'); d = ImageDraw.Draw(t)
        if im:
            a = im.copy(); a.thumbnail((440, 290)); t.paste(a, (5, 5))
            x0, y0, x1, y1, _ = crop_box(*im.size, k)
            b = im.crop((int(x0), int(y0), int(x1), int(y1))); b.thumbnail((290, 290)); t.paste(b, (465, 5))
        d.text((5, 300), f"#{r['n']}  {r.get('licence', '')[:60]}", fill='black')
        d.text((465, 300), 'crop the app shows', fill='gray')
        tiles.append(t)
    out = Image.new('RGB', (760, 330 * max(1, len(tiles))), 'white')
    for i, t in enumerate(tiles): out.paste(t, (0, 330 * i))
    out.save(path, quality=82)


def build(lens, size):
    idx, dest_names = in_use_index()
    out = os.path.join(lens, 'second'); os.makedirs(os.path.join(out, 'sheets'), exist_ok=True)
    pre, slots, auto_none = {}, [], {}
    for g in sorted(d for d in os.listdir(lens) if os.path.exists(os.path.join(lens, d, 'judge-1.json'))):
        gd = os.path.join(lens, g)
        task = {s['slot']: s for s in load(os.path.join(gd, 'task.json'), [])}
        cands, j1 = {}, {}
        for f in ('candidates.json', 'candidates-search.json'):
            for s, v in (load(os.path.join(gd, f), {}) or {}).items():
                if isinstance(v, list): cands.setdefault(s, []).extend(v)
        for f in ('judge-1.json', 'judge-1-search.json'):
            j1.update(load(os.path.join(gd, f), {}) or {})
        for s, v in j1.items():
            if not new_file_choice(v): continue
            sid, k = f'{g}|{s}', kind(s)
            key = (task.get(s) or {}).get('key')
            rows = [check(c, k, idx, dest_names, key) for c in cands.get(s, [])]
            pre[sid] = [r for r, _ in rows]
            ok = [(r, im) for r, im in rows if r['status'] == 'pass']
            if not ok:
                auto_none[sid] = {'choice': 'none: every candidate failed the scripted checks', 'precheck': pre[sid]}
                continue
            sp = os.path.join(out, 'sheets', f"{g}__{s.replace(':', '-')}.jpg")
            sheet(ok, k, sp)
            slots.append({'id': sid, 'group': g, 'slot': s, 'kind': k, 'key': key, 'current': (task.get(s) or {}).get('current'),
                          'sheet': sp, 'candidates': [{x: r.get(x) for x in ('n', 'file', 'licence', 'notes')} for r, _ in ok]})
    for f in glob.glob(os.path.join(out, 'batch-*.json')):
        if not f.endswith('.out.json'): os.remove(f)
    nb = max(1, -(-len(slots) // size)) if slots else 0
    per = -(-len(slots) // nb) if nb else 0
    for b in range(nb):
        json.dump({'batch': b + 1, 'slots': slots[b * per:(b + 1) * per]}, open(os.path.join(out, f'batch-{b + 1:02d}.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(pre, open(os.path.join(out, 'precheck.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(auto_none, open(os.path.join(out, 'auto-none.json'), 'w'), indent=1, ensure_ascii=False)
    nfail = sum(1 for v in pre.values() for r in v if r['status'] == 'fail')
    print(f'{len(pre)} slots to the second judge, {sum(len(v) for v in pre.values())} candidates checked ({nfail} failed by script), '
          f'{len(auto_none)} slots with no passing candidate, {len(slots)} slots in {nb} batch(es) -> {out}')


def split(lens):
    out = os.path.join(lens, 'second'); per = {}
    for f in sorted(glob.glob(os.path.join(out, 'batch-*.out.json'))) + [os.path.join(out, 'auto-none.json')]:
        for sid, v in (load(f, {}) or {}).items():
            g, s = sid.split('|', 1); per.setdefault(g, {})[s] = v
    expected = {s['id'] for f in glob.glob(os.path.join(out, 'batch-[0-9][0-9].json')) for s in json.load(open(f))['slots']}
    missing = sorted(expected - {f'{g}|{s}' for g, d in per.items() for s in d})
    for g, d in per.items():
        p = os.path.join(lens, g, 'judge-2.json')
        cur = load(p, {}) or {}; cur.update(d)
        json.dump(cur, open(p, 'w'), indent=1, ensure_ascii=False)
    print(f'{sum(len(d) for d in per.values())} verdicts into {len(per)} judge-2.json files'
          + (f'; MISSING (rerun their batch): {", ".join(missing)}' if missing else ''))
    if missing: sys.exit(2)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ('build', 'split'): sys.exit(__doc__)
    if a[0] == 'build': build(a[1], int(a[a.index('--size') + 1]) if '--size' in a else 35)
    else: split(a[1])
