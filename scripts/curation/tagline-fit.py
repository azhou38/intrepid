#!/usr/bin/env python3
"""Checks that every destination tagline fills exactly two lines of the destination sheet's header (WRITING.md → tagline).

  python3 scripts/curation/tagline-fit.py [--ids id,id,…] [--text "a tagline to try"]

The header (DestinationSheet's heroTagline) shows the tagline in the iOS system font (SF Pro, 14 pt, medium, 0.1 letter
spacing) with numberOfLines={2}, in a box 40 pt narrower than the screen (heroContent's 20 + 20 padding). A tagline must:
  - fit in two lines on the narrowest phone the app supports (375 pt), or it is cut off with "…";
  - need a second line on the widest phone (440 pt), or it is a single short line under the name.
It is measured with the same font (macOS ships it as SFNS.ttf), wrapped word by word as iOS wraps it, with a small margin
for rendering differences. Prints each failing destination with the reason and roughly how many characters to cut or add;
exits 1 if any fail. --text checks one draft (for writers). Needs macOS (the font file) and Pillow.
"""
import json, subprocess, sys
from PIL import ImageFont

NARROW, WIDE = 375, 440
PAD = 40
MARGIN = 0.97                  # PIL vs Core Text: measure against a slightly narrower box when checking the 2-line limit
FONT = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 14)
FONT.set_variation_by_axes([100, 17, 400, 500])
TRACK = 0.1                    # letterSpacing, added after every character


def width(s: str) -> float:
    return FONT.getlength(s) + TRACK * len(s)


def lines(text: str, box: float) -> list[str]:
    out, cur = [], ''
    for word in text.split():
        trial = f'{cur} {word}' if cur else word
        if width(trial) <= box:
            cur = trial
            continue
        if cur:
            out.append(cur)
        cur = word
    if cur:
        out.append(cur)
    return out


def check(text: str) -> tuple[bool, str]:
    narrow = lines(text, (NARROW - PAD) * MARGIN)
    wide = lines(text, WIDE - PAD)
    if len(narrow) > 2:
        n = len(text)
        while n > 0 and len(lines(text[:n], (NARROW - PAD) * MARGIN)) > 2:
            n -= 1
        return False, f'{len(narrow)} lines at {NARROW} pt (cut ~{len(text) - n} characters)'
    if len(wide) < 2:
        short = (WIDE - PAD) - width(text)
        return False, f'one line at {WIDE} pt (add ~{max(1, round(short / width("e")))} characters)'
    return True, f'two lines from {NARROW} to {WIDE} pt'


def main():
    args = sys.argv[1:]
    if '--text' in args:
        t = args[args.index('--text') + 1]
        ok, why = check(t)
        print(('fits: ' if ok else 'FAILS: ') + why)
        for l in lines(t, (NARROW - PAD) * MARGIN):
            print('  |', l)
        sys.exit(0 if ok else 1)
    dump = subprocess.run(
        ['npx', 'tsx', '-e', "import { DESTINATIONS } from './src/data/destinations'; console.log(JSON.stringify(DESTINATIONS.map(d => ({ id: d.id, name: d.name, tagline: d.tagline }))))"],
        capture_output=True, text=True, check=True).stdout
    dests = json.loads(dump)
    if '--ids' in args:
        want = set(args[args.index('--ids') + 1].split(','))
        dests = [d for d in dests if d['id'] in want]
    fails = 0
    for d in dests:
        ok, why = check(d['tagline'] or '')
        if not ok:
            fails += 1
            print(f"{d['id']:<32} {why}")
    print(f'{fails} of {len(dests)} taglines are not exactly two lines')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
