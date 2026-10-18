#!/usr/bin/env python3
"""Shows what a spot's FULL-SCREEN HERO would show of a photo (IMAGES.md → "The hero crop").

  python3 scripts/curation/hero-crop.py <image path or URL> [--x 0.5] [--y 0.5] [--out crop.jpg]
  python3 scripts/curation/hero-crop.py <file1> <file2> … --sheet sheet.jpg      (several side by side, centred)

The hero is full screen width by about half the screen height (aspect ~0.95, nearly square), cover-fitted. A landscape photo
therefore shows only a middle slice of its width: 16:9 → 53%, 3:2 → 63%, 2:1 → 48%, 3:1 → 32% (and a portrait photo shows a
middle slice of its height). --x / --y are the HERO_FOCUS the app would use (0 keeps the left / top edge in view, 1 the
right / bottom; default 0.5, the plain centre crop). Writes the crop and prints the visible window as fractions of the
photo, so a judge can LOOK at it (Read the output image) and confirm the named object is in it and recognisable. Uses
ffmpeg; a URL is downloaded with the curation user agent (pass a Commons thumbnail, 960 px, not the original).
"""
import subprocess, sys, tempfile, os, urllib.request, shutil

HERO_ASPECT = 0.95   # frame width / height: 390 x (0.52 * 844 - 34) on an iPhone 15


def fetch(src, d):
    if not src.startswith('http'):
        return src
    out = os.path.join(d, 'src%d.jpg' % len(os.listdir(d)))
    req = urllib.request.Request(src, headers={'User-Agent': 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'})
    with urllib.request.urlopen(req, timeout=60) as r, open(out, 'wb') as f:
        shutil.copyfileobj(r, f)
    return out


def size(path):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', path],
                       capture_output=True, text=True, check=True).stdout.strip()
    w, h = o.split('x')
    return int(w), int(h)


def window(w, h, x=0.5, y=0.5):
    """The cover-fit crop of a w x h photo into the hero frame: (left, top, width, height) in photo pixels."""
    if w / h > HERO_ASPECT:      # wider than the frame: full height, a slice of the width
        cw, ch = h * HERO_ASPECT, h
    else:                        # taller: full width, a slice of the height
        cw, ch = w, w / HERO_ASPECT
    return (w - cw) * x, (h - ch) * y, cw, ch


def crop(path, out, x, y):
    w, h = size(path)
    l, t, cw, ch = window(w, h, x, y)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', f'crop={int(cw)}:{int(ch)}:{int(l)}:{int(t)},scale=-2:480', '-q:v', '3', out], check=True)
    return l / w, (l + cw) / w, t / h, (t + ch) / h


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0].startswith('--'):
        sys.exit(__doc__)
    opt = lambda f, d=None: a[a.index(f) + 1] if f in a else d
    x, y = float(opt('--x', 0.5)), float(opt('--y', 0.5))
    srcs = [v for i, v in enumerate(a) if not v.startswith('--') and (i == 0 or a[i - 1] not in ('--x', '--y', '--out', '--sheet'))]
    d = tempfile.mkdtemp()
    paths = [fetch(s, d) for s in srcs]
    if '--sheet' in a:
        crops = []
        for i, p in enumerate(paths):
            c = os.path.join(d, f'c{i}.jpg')
            fl, fr, ft, fb = crop(p, c, 0.5, 0.5)
            print(f'{srcs[i]}: shows {fl:.0%}–{fr:.0%} of the width, {ft:.0%}–{fb:.0%} of the height')
            crops.append(c)
        cmd = ['ffmpeg', '-v', 'error', '-y'] + [t for c in crops for t in ('-i', c)] + ['-filter_complex', f'hstack=inputs={len(crops)}', opt('--sheet')]
        subprocess.run(cmd, check=True)
    else:
        out = opt('--out', 'hero-crop.jpg')
        fl, fr, ft, fb = crop(paths[0], out, x, y)
        print(f'wrote {out}: shows {fl:.0%}–{fr:.0%} of the width, {ft:.0%}–{fb:.0%} of the height (x={x}, y={y})')
