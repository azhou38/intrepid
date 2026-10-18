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

UA = 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'
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
    return round(mean, 3), round(dark, 3)


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
            m, d = measure(Image.open(io.BytesIO(data)))
        except Exception as ex:
            return {'key': k, 'error': str(ex)}
        return {'key': k, 'mean': m, 'dark': d}

    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(one, keys):
            out.append(r)
    ok = sorted([r for r in out if 'mean' in r], key=lambda r: r['mean'])
    for r in ok[:60]:
        print(f"{r['mean']:.3f}  dark {r['dark']:.2f}  {r['key']}")
    errs = [r for r in out if 'error' in r]
    print(f'{len(ok)} measured, {len(errs)} failed')
    if '--json' in args:
        json.dump(ok + errs, open(args[args.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
