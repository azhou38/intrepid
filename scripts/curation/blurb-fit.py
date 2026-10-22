#!/usr/bin/env python3
"""Checks that every destination's When to Visit sentence (bestTimeBlurb) fills two or three lines of its card (WRITING.md → bestTimeBlurb).

  python3 scripts/curation/blurb-fit.py [--ids id,id,…] [--text "a blurb with {months}" --months 12,1,2]

The About tab's When to Visit card (DestinationSheet's wtvLede) shows the blurb, with {months} replaced by the formatted best
months ("Dec–Feb", "Mar–May and Sep–Nov"), in the iOS system font (SF Pro, 16 pt, semibold), in a box 62 pt narrower than the
screen (the panel's 16 + 16 padding, the card's 14 + 14 padding and 1 + 1 border). The sentence must:
  - fit in three lines on the narrowest phone the app supports (375 pt), or it becomes a block of text;
  - need a second line on the widest phone (440 pt), or it is a thin single line.
Measured with the same font (macOS ships it as SFNS.ttf), wrapped word by word as iOS wraps it, with a small margin for rendering
differences. Prints each failing destination with the reason and roughly how many characters to cut or add; exits 1 if any fail.
--text checks one draft (for writers). Needs macOS (the font file) and Pillow.
"""
import json, subprocess, sys
from PIL import ImageFont

NARROW, WIDE = 375, 440
PAD = 62
MIN_LINES, MAX_LINES = 2, 3
MARGIN = 0.97                  # PIL vs Core Text: measure against a slightly narrower box when checking the 3-line limit
FONT = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 16)
FONT.set_variation_by_axes([100, 17, 400, 600])
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def format_months(months: list[int]) -> str:
    """The app's formatMonths (DestinationSheet.tsx): runs of consecutive months, Dec–Jan wrapping."""
    idx = sorted(m - 1 for m in months)
    if len(idx) == 12:
        return 'any time of year'
    runs: list[list[int]] = []
    for i in idx:
        if runs and i == runs[-1][-1] + 1:
            runs[-1].append(i)
        else:
            runs.append([i])
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == 11:
        runs[0] = runs.pop() + runs[0]
    parts = [MONTHS[r[0]] if len(r) == 1 else f'{MONTHS[r[0]]}–{MONTHS[r[-1]]}' for r in runs]
    return parts[0] if len(parts) == 1 else ', '.join(parts[:-1]) + ' and ' + parts[-1]


def lines(text: str, box: float) -> list[str]:
    out, cur = [], ''
    for word in text.split():
        trial = f'{cur} {word}' if cur else word
        if FONT.getlength(trial) <= box:
            cur = trial
            continue
        if cur:
            out.append(cur)
        cur = word
    if cur:
        out.append(cur)
    return out


def check(blurb: str, months: list[int]) -> tuple[bool, str, str]:
    if blurb.count('{months}') != 1:
        return False, 'needs exactly one {months}', blurb
    text = blurb.replace('{months}', format_months(months) if months else 'year-round')
    narrow = lines(text, (NARROW - PAD) * MARGIN)
    wide = lines(text, WIDE - PAD)
    if len(narrow) > MAX_LINES:
        n = len(text)
        while n > 0 and len(lines(text[:n], (NARROW - PAD) * MARGIN)) > MAX_LINES:
            n -= 1
        return False, f'{len(narrow)} lines at {NARROW} pt (max {MAX_LINES}: cut ~{len(text) - n} characters)', text
    if len(wide) < MIN_LINES:
        short = (WIDE - PAD) - FONT.getlength(text)
        return False, f'one line at {WIDE} pt (min {MIN_LINES}: add ~{max(1, round(short / FONT.getlength("e")))} characters)', text
    return True, f'{len(wide)}–{len(narrow)} lines from {WIDE} to {NARROW} pt', text


def main():
    args = sys.argv[1:]
    if '--text' in args:
        t = args[args.index('--text') + 1]
        months = [int(m) for m in args[args.index('--months') + 1].split(',')] if '--months' in args else []
        ok, why, text = check(t, months)
        print(('fits: ' if ok else 'FAILS: ') + why)
        for l in lines(text, (NARROW - PAD) * MARGIN):
            print('  |', l)
        sys.exit(0 if ok else 1)
    dump = subprocess.run(
        ['npx', 'tsx', '-e', "import { DESTINATIONS } from './src/data/destinations'; console.log(JSON.stringify(DESTINATIONS.map(d => ({ id: d.id, blurb: d.bestTimeBlurb, months: d.bestMonths }))))"],
        capture_output=True, text=True, check=True).stdout
    dests = json.loads(dump)
    if '--ids' in args:
        want = set(args[args.index('--ids') + 1].split(','))
        dests = [d for d in dests if d['id'] in want]
    fails = 0
    for d in dests:
        ok, why, _ = check(d['blurb'] or '', d['months'] or [])
        if not ok:
            fails += 1
            print(f"{d['id']:<32} {why}")
    print(f'{fails} of {len(dests)} When to Visit sentences are not two or three lines')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
