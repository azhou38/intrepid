#!/usr/bin/env python3
"""Stages the WA run's non-Commons photos (IMAGES.md "How a non-Commons photo is added").

  python3 curation/act/stage_external.py stage   # curation/act/lens/external.json -> assets/photos/<slug>.jpg + thumbs
  (commit and push assets/photos)
  python3 curation/act/stage_external.py link    # -> src/data/externalPhotos.json, pinned to HEAD's full SHA

external.json: { "<slot>": { "local": <original>, "name": "ext-<slug>.jpg" (why-visit) | "<photo key>" (header/spot),
                 "by", "license", "page" } }. A why-visit photo is keyed "File:<name>" and its name goes in the picks;
a header is keyed by the destination's name. Every photo is resized to at most 1920 px.
"""
import json, os, re, subprocess, sys
from PIL import Image

STEPS = [120, 250, 500, 960, 1280, 1920]
RAW = 'https://raw.githubusercontent.com/azhou38/intrepid'
EXT = json.load(open('curation/act/lens/external.json'))
slug = lambda k: re.sub(r'[^a-z0-9]+', '-', k.lower().replace('file:', '').rsplit('.', 1)[0]).strip('-')[:70]
key = lambda e: e.get('key') or (e['name'] if not e['name'].startswith('ext-') else f"File:{e['name']}")   # a header sets key: <destination name>

if sys.argv[1] == 'stage':
    for slot, e in EXT.items():
        if 'slug' in e:
            continue   # staged before
        s = slug(e['name'])
        if not os.path.isfile(e['local']):
            print('NOT STAGED (no file at local path):', slot, e['local']); continue
        img = Image.open(e['local']).convert('RGB')
        if img.width > 1920:
            img = img.resize((1920, round(img.height * 1920 / img.width)), Image.LANCZOS)
        os.makedirs('assets/photos/thumbs', exist_ok=True)
        img.save(f'assets/photos/{s}.jpg', quality=88, optimize=True, progressive=True)
        for w in [w for w in STEPS if w < img.width] + [img.width]:
            t = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS) if w < img.width else img
            t.save(f'assets/photos/thumbs/{s}-{w}.jpg', quality=80, optimize=True, progressive=True)
        e['slug'], e['ow'] = s, img.width
        print(slot, '->', f'assets/photos/{s}.jpg', img.size)
    json.dump(EXT, open('curation/act/lens/external.json', 'w'), indent=1, ensure_ascii=False)
elif sys.argv[1] == 'link':
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    ext = json.load(open('src/data/externalPhotos.json'))
    for slot, e in EXT.items():
        if 'slug' not in e or (key(e) in ext and f"/assets/photos/{e['slug']}.jpg" in ext[key(e)]['o']):
            continue   # not staged, or already linked
        if subprocess.run(['git', 'cat-file', '-e', f"HEAD:assets/photos/{e['slug']}.jpg"], capture_output=True).returncode:
            print('NOT LINKED (not committed at HEAD):', key(e)); continue
        ext[key(e)] = {'t': f"{RAW}/{sha}/assets/photos/thumbs/{e['slug']}-{{w}}.jpg",
                       'o': f"{RAW}/{sha}/assets/photos/{e['slug']}.jpg", 'ow': e['ow'],
                       'credit': {'by': e['by'], 'license': e['license'], 'page': e['page']}}
        print('linked', key(e))
    open('src/data/externalPhotos.json', 'w').write(json.dumps(ext, indent=1, ensure_ascii=False) + '\n')
