#!/usr/bin/env python3
"""Checks that every spot bio fits the spot carousel card's three lines (WRITING.md → "Writing a spot" → bio).

  python3 scripts/curation/bio-fit.py [--ids id,id,…] [--json out.json] [--text "a bio to try"]

The card (SpotSheet's SpotCard) shows the bio in the iOS system font (SF Pro, 12.5 pt, medium) with numberOfLines={3},
in a text box CARD_W − 28 = screen width − 92 pt wide. A bio is measured with the same font (macOS ships it as
SFNS.ttf), wrapped word by word as iOS wraps it, at the narrowest phone the app supports (375 pt, iPhone SE / mini),
with a small margin for rendering differences. Anything that needs a fourth line would be cut off with "…" and fails.

Prints each failing spot with its line count and how many characters to cut; exits 1 if any fail. --text checks one
draft bio instead (for writers). Needs macOS (the font file) and Pillow.
"""
import json, subprocess, sys
from PIL import ImageFont

SCREEN_W = 375
BOX_W = SCREEN_W - 92          # CARD_W (W − 64) minus cardImageInfo's 14 + 14 inset
MARGIN = 0.97                  # PIL vs Core Text: measure against a slightly narrower box
MAX_LINES = 3
FONT = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 12.5)
# Axes: width, optical size (iOS uses the Text cut, the axis minimum, below 20 pt), grade, weight 500 (fontWeight '500').
FONT.set_variation_by_axes([100, 17, 400, 500])


def lines(text: str, width: float = BOX_W * MARGIN) -> list[str]:
    out, cur = [], ''
    for word in text.split():
        trial = f'{cur} {word}' if cur else word
        if FONT.getlength(trial) <= width:
            cur = trial
            continue
        if cur:
            out.append(cur)
        # a single word wider than the box breaks by character, as iOS does
        while FONT.getlength(word) > width:
            i = len(word)
            while i > 1 and FONT.getlength(word[:i]) > width:
                i -= 1
            out.append(word[:i]); word = word[i:]
        cur = word
    if cur:
        out.append(cur)
    return out


def overflow(text: str) -> int:
    """Characters to cut (roughly) for the text to fit in MAX_LINES; 0 when it fits."""
    if len(lines(text)) <= MAX_LINES:
        return 0
    n = len(text)
    while n > 0 and len(lines(text[:n])) > MAX_LINES:
        n -= 1
    return len(text) - n


def main():
    args = sys.argv[1:]
    if '--text' in args:
        t = args[args.index('--text') + 1]
        ls = lines(t)
        print(f'{len(ls)} lines' + (f' — cut ~{overflow(t)} characters' if len(ls) > MAX_LINES else ' — fits'))
        for l in ls:
            print('  |', l)
        sys.exit(1 if len(ls) > MAX_LINES else 0)
    dump = subprocess.run(
        ['npx', 'tsx', '-e', "import { SPOTS } from './src/data/spots'; console.log(JSON.stringify(SPOTS.map(s => ({ id: s.id, name: s.name, bio: s.bio }))))"],
        capture_output=True, text=True, check=True).stdout
    spots = json.loads(dump)
    if '--ids' in args:
        want = set(args[args.index('--ids') + 1].split(','))
        spots = [s for s in spots if s['id'] in want]
    fails = []
    for s in spots:
        n = len(lines(s['bio']))
        if n > MAX_LINES:
            fails.append({'id': s['id'], 'name': s['name'], 'lines': n, 'cut': overflow(s['bio']), 'bio': s['bio']})
    for f in fails:
        print(f"{f['id']:<28} {f['name'][:30]:<30} {f['lines']} lines, cut ~{f['cut']} chars")
    print(f'{len(fails)} of {len(spots)} bios exceed {MAX_LINES} lines at {SCREEN_W} pt')
    if '--json' in args:
        json.dump(fails, open(args[args.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
