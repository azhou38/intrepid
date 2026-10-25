#!/usr/bin/env python3
"""Brightens photos that fall below the app's brightness floor and serves the brightened copies instead
(IMAGES.md → "Brightness").

  python3 scripts/curation/brighten-apply.py make  keys.json     # write assets/photos/thumbs/bright-*-<w>.jpg
  (commit and push those files)
  python3 scripts/curation/brighten-apply.py link  keys.json     # point externalPhotos.json at that commit
  npx tsx scripts/build-image-manifest.ts

keys.json is a list of image-manifest keys (a destination name, a spot's photo key, or `File:<name>` for a why-visit
photo). `make` downloads each one's current photo (a 1920 px Commons thumbnail, the original, or the repo file it
already comes from), lifts it with brighten.py's gamma, and writes it at every width the app requests up to its own (1920 px for a
destination header, 1280 otherwise); the widest file doubles as the original. `link` writes an externalPhotos.json entry per key, pinned to the full SHA of the commit
that last touched the files, carrying the original credit marked as brightened.
"""
import io, json, os, re, subprocess, sys, unicodedata, urllib.request, importlib.util
from PIL import Image

spec = importlib.util.spec_from_file_location('br', os.path.join(os.path.dirname(__file__), 'brighten.py'))
br = importlib.util.module_from_spec(spec); spec.loader.exec_module(br)

UA = 'IntrepidApp-Curation/1.0'
STEPS = [120, 250, 500, 960, 1280, 1920]
REPO_RAW = 'https://raw.githubusercontent.com/azhou38/intrepid'


def slug(key):
    k = re.sub(r'^File:', '', key)
    k = re.sub(r'\.(jpe?g|png|webp|tiff?)$', '', k, flags=re.I)
    k = ''.join(c for c in unicodedata.normalize('NFKD', k) if not unicodedata.combining(c))
    return 'bright-' + re.sub(r'[^a-z0-9]+', '-', k.lower()).strip('-')[:70]


def get(url):
    for _ in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()
        except Exception as e:
            err = e
    raise err


def source(key, e, ext):
    if key in ext:
        o = ext[key]['o']
        m = re.search(r'/[0-9a-f]{40}/(assets/photos/.+)$', o)
        if m and os.path.exists(m.group(1)):
            return Image.open(m.group(1))
        return Image.open(io.BytesIO(get(o)))
    if e.get('t') and e.get('ow', 0) > 1920:
        return Image.open(io.BytesIO(get(e['t'].replace('{w}', '1920'))))
    return Image.open(io.BytesIO(get(e['o'].split('?')[0])))


def make(keys):
    entries = json.load(open('src/data/imageManifest.json'))['entries']
    ext = json.load(open('src/data/externalPhotos.json'))
    headers = set(json.loads(subprocess.run(['npx', 'tsx', '-e', "import { DESTINATIONS } from './src/data/destinations'; console.log(JSON.stringify(DESTINATIONS.map(d => d.name)))"], capture_output=True, text=True, check=True).stdout))
    os.makedirs('assets/photos/thumbs', exist_ok=True)
    for k in keys:
        img = source(k, entries[k], ext).convert('RGB')
        # Headers are requested up to 1920 px; cards and spot heroes are served well by 1280.
        cap = 1920 if k in headers else 1280
        if img.width > cap:
            img = img.resize((cap, round(img.height * cap / img.width)), Image.LANCZOS)
        g = br.choose_gamma(img)
        out = br.lift(img, g)
        s = slug(k)
        # The widest file is also the original (`o`): one file per width, nothing stored twice.
        widths = [w for w in STEPS if w < out.width] + [out.width]
        for w in widths:
            t = out.resize((w, round(out.height * w / out.width)), Image.LANCZOS) if w < out.width else out
            t.save(f'assets/photos/thumbs/{s}-{w}.jpg', quality=80, optimize=True, progressive=True)
        b, a = br.measure(img), br.measure(out)
        print(f'{s}: gamma {g}, p40 {b[0]:.2f}→{a[0]:.2f}, mean {b[1]:.2f}→{a[1]:.2f}, {out.width}px')


def link(keys):
    entries = json.load(open('src/data/imageManifest.json'))['entries']
    ext = json.load(open('src/data/externalPhotos.json'))
    for k in keys:
        s = slug(k)
        ws = sorted(int(m.group(1)) for f in os.listdir('assets/photos/thumbs') if (m := re.fullmatch(re.escape(s) + r'-(\d+)\.jpg', f)))
        w = ws[-1]
        path = f'assets/photos/thumbs/{s}-{w}.jpg'
        sha = subprocess.run(['git', 'log', '-1', '--format=%H', '--', path], capture_output=True, text=True).stdout.strip()
        if len(sha) != 40:
            sys.exit(f'{path} is not committed yet: commit and push it first')
        prev = ext.get(k) or entries[k]
        credit = dict(prev.get('credit') or {})
        if credit.get('by') and 'brightened' not in credit['by']:
            credit['by'] = f"{credit['by']} (brightened for the app)"
        credit.setdefault('page', prev.get('credit', {}).get('page'))
        ext[k] = {
            't': f'{REPO_RAW}/{sha}/assets/photos/thumbs/{s}-{{w}}.jpg',
            'o': f'{REPO_RAW}/{sha}/{path}',
            'ow': w,
            'credit': credit,
        }
        print('linked', k)
    json.dump(ext, open('src/data/externalPhotos.json', 'w'), indent=1, ensure_ascii=False)
    open('src/data/externalPhotos.json', 'a').write('\n')


if __name__ == '__main__':
    mode, f = sys.argv[1], sys.argv[2]
    keys = json.load(open(f))
    {'make': make, 'link': link}[mode](keys)
