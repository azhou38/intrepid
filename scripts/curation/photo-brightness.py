#!/usr/bin/env python3
"""Measures how bright every photo in the app is (IMAGES.md → "Brightness").

  python3 scripts/curation/photo-brightness.py [--json out.json] [--keys k1,k2]

For each image-manifest entry (destination headers, why-visit photos `File:…`, spot photos) it downloads the 250 px
thumbnail (cached in .cache/curation/thumbs/) and reports the mean perceived luminance (0–1, sRGB Rec. 709 luma) of
the centre crop the app shows most (the middle ~square), plus the share of near-black pixels. Prints the darkest
first. Gallery photos are not measured.
"""
import concurrent.futures as cf, hashlib, io, json, os, sys, time, urllib.request
from PIL import Image, ImageStat

FLOOR_P40, FLOOR_MEAN = 0.22, 0.30   # IMAGES.md → "Brightness": below either, a photo is too dark (headers, why-visit AND spot photos alike)
UA = 'IntrepidApp-Curation/1.0'
CACHE = '.cache/curation/thumbs'
os.makedirs(CACHE, exist_ok=True)


def url_for(e, w=250):
    if not e.get('t'):
        return e['o']
    steps = [s for s in (120, 250, 500, 960) if s <= e.get('ow', 10**6)]
    return e['t'].replace('{w}', str(next((s for s in steps if s >= w), steps[-1] if steps else 120)))


def fetch(url):
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.img')
    if os.path.exists(f):
        return open(f, 'rb').read()
    for i in range(5):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read()
            open(f, 'wb').write(data)
            return data
        except Exception as ex:
            if '429' in str(ex) or '503' in str(ex):
                time.sleep(5 * 2 ** i); continue
            return None
    return None


def measure(img: Image.Image):
    img = img.convert('RGB')
    w, h = img.size
    s = min(w, h)
    crop = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    L = crop.convert('L')
    mean = ImageStat.Stat(L).mean[0] / 255
    hist = L.histogram()
    dark = sum(hist[:40]) / max(1, sum(hist))
    # 40th-percentile luminance: catches a dark subject under a bright sky (the mean hides it). IMAGES.md → "Brightness".
    n, acc, p40 = sum(hist), 0, 0
    for i, c in enumerate(hist):
        acc += c
        if acc >= n * 0.4:
            p40 = i / 255
            break
    return round(mean, 3), round(dark, 3), round(p40, 3)


def main():
    args = sys.argv[1:]
    entries = json.load(open('src/data/imageManifest.json'))['entries']
    keys = args[args.index('--keys') + 1].split(',') if '--keys' in args else list(entries)
    out = []

    def one(k):
        data = fetch(url_for(entries[k]))
        if not data:
            return {'key': k, 'error': 'fetch failed'}
        try:
            m, d, p = measure(Image.open(io.BytesIO(data)))
        except Exception as ex:
            return {'key': k, 'error': str(ex)}
        return {'key': k, 'mean': m, 'dark': d, 'p40': p, 'below_floor': p < FLOOR_P40 or m < FLOOR_MEAN,
                'kind': 'why-visit' if k.startswith('File:') else 'photo'}

    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(one, keys):
            out.append(r)
    ok = sorted([r for r in out if 'mean' in r], key=lambda r: r['mean'])
    purpose = set(json.load(open('scripts/curation/dark-on-purpose.json'))) if os.path.exists('scripts/curation/dark-on-purpose.json') else set()
    below = [r for r in ok if r['below_floor'] and r['key'] not in purpose]   # night, dusk, caves, glow-worms, flags: left dark on purpose (IMAGES.md)
    print(f"{len(below)} below the floor (p40 < {FLOOR_P40} or mean < {FLOOR_MEAN}), not counting scripts/curation/dark-on-purpose.json; why-visit: {sum(r['kind']=='why-visit' for r in below)}")
    for r in below:
        print(f"p40 {r['p40']:.2f}  mean {r['mean']:.2f}  {r['kind']:9}  {r['key']}")
    errs = [r for r in out if 'error' in r]
    print(f'{len(ok)} measured, {len(errs)} failed')
    if '--json' in args:
        json.dump(ok + errs, open(args[args.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
