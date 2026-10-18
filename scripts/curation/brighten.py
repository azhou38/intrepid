#!/usr/bin/env python3
"""Brightens a dark photo for the app (IMAGES.md → "Brightness"): a gamma lift that raises the shadows and mid-tones
the most and leaves highlights (a bright sky) nearly where they were, so a dark subject under a bright sky comes up
without the sky blowing out.

  python3 scripts/curation/brighten.py <in> <out.jpg> [--gamma g] [--max-w 1920]

Without --gamma, the gamma is chosen so the photo reaches the brightness floor: its 40th-percentile luminance at least
TARGET_P40 and its mean at least TARGET_MEAN (centre square), never stronger than MIN_GAMMA. Prints the gamma used
and the before/after measures. Also importable (lift, choose_gamma, measure).
"""
import sys
from PIL import Image, ImageEnhance

TARGET_P40 = 0.26
TARGET_MEAN = 0.36
MIN_GAMMA = 0.5
FLOOR_P40 = 0.22     # below either floor a photo is too dark (photo-brightness.py)
FLOOR_MEAN = 0.30


def measure(img):
    L = img.convert('L')
    w, h = L.size
    s = min(w, h)
    L = L.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    px = sorted(L.getdata())
    n = len(px)
    return px[int(n * 0.4)] / 255, sum(px) / n / 255


def lift(img, g):
    img = img.convert('RGB')
    lut = [round(255 * (i / 255) ** g) for i in range(256)]
    out = img.point(lut * 3)
    # a gamma lift greys colours slightly; give a little back
    return ImageEnhance.Color(out).enhance(1 + (1 - g) * 0.25)


def choose_gamma(img):
    p40, mean = measure(img)
    g = 1.0
    while g > MIN_GAMMA:
        q40, qmean = measure(lift(img.resize((max(1, img.width // 4), max(1, img.height // 4))), g))
        if q40 >= TARGET_P40 and qmean >= TARGET_MEAN:
            break
        g = round(g - 0.05, 2)
    return max(g, MIN_GAMMA)


if __name__ == '__main__':
    a = sys.argv[1:]
    src, dst = a[0], a[1]
    img = Image.open(src).convert('RGB')
    mw = int(a[a.index('--max-w') + 1]) if '--max-w' in a else 1920
    if img.width > mw:
        img = img.resize((mw, round(img.height * mw / img.width)), Image.LANCZOS)
    g = float(a[a.index('--gamma') + 1]) if '--gamma' in a else choose_gamma(img)
    out = lift(img, g)
    out.save(dst, quality=88, optimize=True, progressive=True)
    b, c = measure(img), measure(out)
    print(f'gamma {g}: p40 {b[0]:.2f}→{c[0]:.2f}, mean {b[1]:.2f}→{c[1]:.2f}, {out.width}x{out.height}')
