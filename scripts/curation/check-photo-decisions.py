#!/usr/bin/env python3
"""Fails when a spot or destination header has no photo decision, so a rejected slot can never fall back to the
article's lead image (Viseisei shipped with a map of Viti Levu, Lake Tagimaucia with an Indonesian volcano).

  python3 scripts/curation/check-photo-decisions.py --country FJ [--ids nadi-5,taveuni-6]

A slot is decided when its photo key (a spot's `wiki` title, else its name; a destination's name for its header) is in
WIKI_IMAGE_OVERRIDES, externalPhotos.json or NO_PHOTO, or when scripts/curation/photo-verdicts.json holds an accept for
`spot:<id>` / `dest:<id>:header`. Anything else is on the app's default (the Wikipedia lead image, or a search hit) and
nobody has said it is right: accept it with `record-verdicts.ts`, give it a photo, or add it to NO_PHOTO.
Run it in the Verify step of every region run. Exit 1 lists the undecided slots."""
import json, re, sys

args = sys.argv[1:]
def opt(f):
    return args[args.index(f) + 1] if f in args else None
country, ids = opt('--country'), (opt('--ids') or '').split(',') if opt('--ids') else None
if not country and not ids:
    sys.exit(__doc__)

dest = open('src/data/destinations.ts').read()
spots = open('src/data/spots.ts').read()
ov = open(opt('--overrides') or 'src/data/imageOverrides.ts').read()   # --overrides: test against another copy
ext = json.load(open('src/data/externalPhotos.json'))
verdicts = json.load(open('scripts/curation/photo-verdicts.json'))

def block(name):
    a = ov.index('export const ' + name)
    b = ov.index(']);', a) if name == 'NO_PHOTO' else ov.index('\n};', a)
    return ov[a:b]
overrides = set(re.findall(r'^  "((?:[^"\\]|\\.)*)": ', block('WIKI_IMAGE_OVERRIDES'), re.M))
no_photo = set(re.findall(r'^  "((?:[^"\\]|\\.)*)",$', block('NO_PHOTO'), re.M))
decided = overrides | no_photo | set(ext)

dests = {}  # id -> (name, countryCode)
for m in re.finditer(r"id: ['\"]([^'\"]+)['\"], name: ['\"]([^'\"]+)['\"].*?countryCode: ['\"](\w\w)['\"]", dest):
    dests[m.group(1)] = (m.group(2), m.group(3))

problems = []
for did, (name, cc) in dests.items():
    if (ids and did not in ids) or (not ids and cc != country): continue
    if name not in decided and f'dest:{did}:header' not in verdicts:
        problems.append(f'header  {did} ({name})')

for m in re.finditer(r"\{ id: ['\"]([^'\"]+)['\"],(.*?)\bbio:", spots, re.S):
    sid, body = m.group(1), m.group(2)
    n = re.search(r'name: "((?:[^"\\]|\\.)*)"', body)
    w = re.search(r'wiki: "((?:[^"\\]|\\.)*)"', body)
    d = re.search(r"destinationId: ['\"]([^'\"]+)['\"]", body)
    cc = dests[d.group(1)][1] if d and d.group(1) in dests else (re.search(r"countryCode: ['\"](\w\w)['\"]", body) or [None, None])[1]
    if (ids and sid not in ids) or (not ids and cc != country) or not n: continue
    key = (w or n).group(1)
    if key not in decided and f'spot:{sid}' not in verdicts:
        problems.append(f'spot    {sid} ({key})')

if problems:
    print(f'{len(problems)} slot(s) on the app default with no recorded decision:')
    print('\n'.join('  ' + p for p in problems))
    sys.exit(1)
print('every slot has a photo decision')
