#!/usr/bin/env python3
"""Lens candidate gathering by script (PIPELINES.md → "Lean runs"): searches, filters, de-duplicates and downloads photo
candidates for a group's `search` slots, and draws one numbered contact sheet per slot, so the judges only look and
choose. The image-searcher agent is left only the slots this finds nothing for, and the sources it could not reach.

  python3 scripts/curation/gather-photo-candidates.py <group-dir> [--max 10] [--slots spot:a,spot:b] [--force]

Reads <group-dir>/task.json (lens-triage.ts). Per `search` slot, in order:
  1. the Wikipedia article's lead image (a spot's default photo is always offered: image-searcher checklist),
  2. Commons: a geosearch round the pin (spots) and name searches qualified by destination and country,
  3. Openverse (Flickr and others; Flickr originals need a Referer, which this sends), only when Commons gave too few.
Then the IMAGES.md pre-filter in code: minimum width for the slot type, JPEG/PNG only, no map/drawing/flag/logo titles or
categories, nothing dated before 2000, no near-grey scans, nothing geotagged more than 25 km from a spot's pin (150 km for a
destination); duplicates dropped; ranked lead image first, then photos that name the place, nearest first.
Thumbnails (480 px) are cached in .cache/curation/thumbs/ and reused across runs.

Writes <group-dir>/candidates.json ({slot: [{n, file|url, page, width, height, licence, by, date, dist_m, source, thumb}]},
merged: an existing slot is kept unless --force) and <group-dir>/sheets/<slot>.jpg. `confirm` slots get their current
photos on <group-dir>/sheets/confirm.jpg for the first judge. A source that failed (rate limit, block, timeout) goes under
`_unresolved` in candidates.json: an open error to retry, never a finding that the place has no photo.
Prints one summary line.
"""
import hashlib, io, json, math, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont

UA = 'IntrepidApp-Curation/1.0'
CACHE = os.path.join('.cache', 'curation')
os.makedirs(os.path.join(CACHE, 'api'), exist_ok=True)
os.makedirs(os.path.join(CACHE, 'thumbs'), exist_ok=True)
BAD = re.compile(r'\b(map|maps|satellite|locator|flag|coat of arms|logo|plan|diagram|drawing|illustration|sketch|painting|engraving|lithograph|poster|chart|landsat|stamp|banknote|coin|svg|historical images|black and white)\b', re.I)
MIN_W = {'header': 1500, 'why': 1280, 'spot': 960}
last = {}

def pace(host):
    w = last.get(host, 0) + 1.0 - time.time()
    if w > 0: time.sleep(w)
    last[host] = time.time()

def get(url, referer=None, cache_days=14, binary=False):
    """GET with the shared pace, backoff on 429 and an on-disk cache. Returns (status, body) — status 0 on failure."""
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, 'thumbs' if binary else 'api', key + ('.jpg' if binary else '.json'))
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < cache_days * 86400:
        return 200, open(path, 'rb').read() if binary else open(path).read()
    host = urllib.parse.urlparse(url).netloc
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh) ' + UA if binary else UA}
    if referer: headers['Referer'] = referer
    for i in range(4):
        pace(host)
        try:
            body = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40).read()
            if binary: open(path, 'wb').write(body)
            else: open(path, 'w').write(body.decode('utf-8', 'replace'))
            return 200, body if binary else body.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < 3: time.sleep(30 * 2 ** i); continue
            return e.code, None
        except Exception:
            if i < 2: time.sleep(5); continue
            return 0, None
    return 429, None

def api_json(url):
    st, body = get(url)
    if st != 200 or not body: return st, None
    try: return 200, json.loads(body)
    except Exception: return 0, None

def commons(params):
    return api_json('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2}))

def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    return 2 * 6371000 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))

# Places, parsed from the data files (no TypeScript run needed).
SPOTS_SRC = open('src/data/spots.ts').read()
DEST_SRC = open('src/data/destinations.ts').read()
def field(line, name):
    m = re.search(name + r': ("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')', line)
    return m.group(1)[1:-1] if m else None
def spot(sid):
    m = re.search(r"\{ id: ['\"]%s['\"],[^\n]*" % re.escape(sid), SPOTS_SRC)
    if not m: return None
    l = m.group(0); c = re.search(r'latitude: (-?[\d.]+), longitude: (-?[\d.]+)', l)
    return {'name': field(l, 'name'), 'wiki': field(l, 'wiki'), 'dest': field(l, 'destinationId'), 'country': field(l, 'country'),
            'coords': (float(c.group(1)), float(c.group(2))) if c else None}
def destination(did):
    m = re.search(r"id: ['\"]%s['\"], name: (\"[^\"]*\"|'[^']*')" % re.escape(did), DEST_SRC)
    if not m: return None
    block = DEST_SRC[m.start():m.start() + 6000]
    c = re.search(r'latitude: (-?[\d.]+), longitude: (-?[\d.]+)', block)
    why = re.search(r'whyVisit: \[([^\]]*)\]', block)
    return {'name': m.group(1)[1:-1], 'country': field(block, 'country'), 'coords': (float(c.group(1)), float(c.group(2))) if c else None,
            'why': [w[1:-1] for w in re.findall(r'"[^"]*"|\'[^\']*\'', why.group(1))] if why else []}

def fileinfo(titles):
    """Commons imageinfo for up to 50 File: titles at once."""
    out = {}
    for i in range(0, len(titles), 50):
        st, d = commons({'action': 'query', 'titles': '|'.join('File:' + t for t in titles[i:i + 50]), 'prop': 'imageinfo|coordinates|categories',
                         'iiprop': 'url|size|mime|extmetadata', 'iiurlwidth': 480, 'cllimit': 'max', 'clshow': '!hidden'})
        if not d: continue
        for p in d.get('query', {}).get('pages', []):
            if p.get('imageinfo'): out[p['title'][5:]] = p
    return out

def slot_context(sl):
    kind, _, rest = sl['slot'].partition(':')
    if kind == 'spot':
        s = spot(rest)
        if not s: return None
        d = destination(s['dest']) if s['dest'] else None
        quals = [x for x in [d and d['name'], s['country'] or (d and d['country'])] if x]
        return {'type': 'spot', 'name': s['name'], 'wiki': s['wiki'] or s['name'], 'coords': s['coords'], 'quals': quals, 'reason': None}
    did, _, part = rest.partition(':')
    d = destination(did)
    if not d: return None
    if part.startswith('why'):
        i = int(part[3:]) - 1
        return {'type': 'why', 'name': d['name'], 'wiki': d['name'], 'coords': d['coords'], 'quals': [d['country']], 'reason': d['why'][i] if i < len(d['why']) else None}
    return {'type': 'header', 'name': d['name'], 'wiki': d['name'], 'coords': d['coords'], 'quals': [d['country']], 'reason': None}

STOP = {'the', 'of', 'and', 'national', 'park', 'beach', 'reserve', 'lookout', 'point', 'head', 'bay', 'mount', 'lake', 'river', 'falls', 'island', 'big', 'new', 'old', 'north', 'south', 'east', 'west', 'museum', 'gallery', 'garden', 'gardens', 'walk', 'track', 'trail', 'town', 'village', 'house', 'hill', 'nature'}
def name_words(name):
    base = re.findall(r"[a-z']+", re.sub(r'\([^)]*\)', '', name.lower()))
    return [w for w in base if len(w) > 3 and w not in STOP] or [w for w in base if len(w) > 3]

def gather(sl, ctx, maxn, unresolved):
    titles, origin = [], {}
    def add(t, src):
        if t not in origin: titles.append(t); origin[t] = src
    # 1. The Wikipedia lead image.
    st, d = api_json('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'pageimages', 'piprop': 'name', 'redirects': 1, 'titles': ctx['wiki'], 'format': 'json', 'formatversion': 2}))
    if d is None: unresolved.append(f'wikipedia lead image: HTTP {st}')
    else:
        for p in d.get('query', {}).get('pages', []):
            if p.get('pageimage'): add(p['pageimage'].replace('_', ' '), 'wikipedia-lead')
    # 2. Commons geosearch (spots) and name searches.
    if ctx['type'] == 'spot' and ctx['coords']:
        st, d = commons({'action': 'query', 'list': 'geosearch', 'gscoord': f"{ctx['coords'][0]}|{ctx['coords'][1]}", 'gsradius': 1500, 'gsnamespace': 6, 'gslimit': 40})
        if d is None: unresolved.append(f'commons geosearch: HTTP {st}')
        else:
            for g in d.get('query', {}).get('geosearch', []): add(g['title'][5:], 'commons-geo')
    base = ctx['reason'] or ctx['name']
    queries = [f'"{ctx["name"]}" {q}' for q in ctx['quals'][:2]] + [f'"{ctx["name"]}"']
    if ctx['reason']: queries.insert(0, f'{ctx["name"]} {ctx["reason"]}')
    for q in queries:
        st, d = commons({'action': 'query', 'list': 'search', 'srsearch': q + ' filetype:bitmap', 'srnamespace': 6, 'srlimit': 20})
        if d is None: unresolved.append(f'commons search "{q}": HTTP {st}'); continue
        for r in d.get('query', {}).get('search', []): add(r['title'][5:], 'commons-search')
    info = fileinfo(titles)
    cands, minw = [], MIN_W[ctx['type']]
    for t in titles:
        p = info.get(t)
        if not p: continue
        ii = p['imageinfo'][0]; md = ii.get('extmetadata', {})
        cats = ' '.join(c['title'] for c in p.get('categories', []))
        if ii.get('mime') not in ('image/jpeg', 'image/png') or ii.get('width', 0) < minw: continue
        if BAD.search(t) or BAD.search(cats): continue
        date = re.sub('<[^>]+>', '', md.get('DateTimeOriginal', {}).get('value', '') or md.get('DateTime', {}).get('value', ''))
        yr = re.search(r'(1[5-9]\d\d|20\d\d)', date)
        if yr and int(yr.group(1)) < 2000: continue
        text = ' '.join([t, cats, md.get('ImageDescription', {}).get('value', ''), md.get('ObjectName', {}).get('value', '')]).lower()
        named = all(w in text for w in name_words(ctx['name']))
        co = p['coordinates'][0] if p.get('coordinates') else None
        dist = int(hav(ctx['coords'], (co['lat'], co['lon']))) if co and ctx['coords'] else None
        # Geotagged far from the place: another place of the same name (Sovereign Hill's Red Hill Road for Canberra's Red Hill).
        if dist is not None and dist > (25_000 if ctx['type'] == 'spot' else 150_000): continue
        cands.append({'file': t, 'page': ii.get('descriptionurl'), 'width': ii['width'], 'height': ii['height'],
                      'licence': re.sub('<[^>]+>', '', md.get('LicenseShortName', {}).get('value', '')),
                      'by': re.sub('<[^>]+>', '', md.get('Artist', {}).get('value', ''))[:80], 'date': (yr.group(1) if yr else ''),
                      'dist_m': dist, 'source': origin[t], 'named': named, 'thumb_url': ii.get('thumburl')})
    # 3. Openverse, only when Commons gave too few.
    if len(cands) < 3:
        q = f'{ctx["name"]} {ctx["quals"][0] if ctx["quals"] else ""}'.strip()
        st, d = api_json('https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': q, 'page_size': 12}))
        if d is None: unresolved.append(f'openverse "{q}": HTTP {st} (Cloudflare challenges scripts; retry, or search in a browser)')
        else:
            for r in d.get('results', []):
                if (r.get('width') or 0) < minw or BAD.search(r.get('title') or ''): continue
                cands.append({'url': r.get('url'), 'page': r.get('foreign_landing_url'), 'width': r.get('width'), 'height': r.get('height'),
                              'licence': f"CC {(r.get('license') or '').upper()} {r.get('license_version') or ''}".strip(), 'by': (r.get('creator') or '')[:80],
                              'title': r.get('title'), 'date': '', 'dist_m': None, 'source': 'openverse:' + (r.get('provider') or ''),
                              'named': all(w in (r.get('title') or '').lower() for w in name_words(ctx['name'])), 'thumb_url': r.get('url')})
    # Ranked: the lead image, then photos that NAME the place (title, categories or description), nearest geotag first, then
    # at most two unnamed photos found only by their geotag (a geosearch also returns the cars, schools and offices nearby).
    seen, out, unnamed = set(), [], 0
    rank = lambda c: (0 if c['source'] == 'wikipedia-lead' else 1 if c['named'] else 2, c['dist_m'] if c['dist_m'] is not None else 10 ** 7)
    cands.sort(key=rank)
    for c in cands:
        k = c.get('file') or c.get('url')
        if k in seen: continue
        seen.add(k)
        if c['source'] != 'wikipedia-lead' and not c['named']:
            if unnamed >= 2: continue
            unnamed += 1
        st, raw = get(c['thumb_url'], referer='https://www.flickr.com/' if 'flickr' in (c['thumb_url'] or '') else None, binary=True)
        if raw is None: unresolved.append(f'thumbnail {k}: HTTP {st}'); continue
        try:
            im = Image.open(io.BytesIO(raw)).convert('RGB')
        except Exception:
            unresolved.append(f'thumbnail {k}: not an image'); continue
        hsv = im.resize((64, 48)).convert('HSV')
        if sum(p[1] for p in hsv.getdata()) / (255 * 64 * 48) <= 0.08: continue   # near-grey scan
        c['thumb'] = os.path.join(CACHE, 'thumbs', hashlib.sha1(c['thumb_url'].encode()).hexdigest() + '.jpg')
        del c['thumb_url']
        out.append(c)
        if len(out) >= maxn: break
    for i, c in enumerate(out, 1): c['n'] = i
    return out

def sheet(items, path, label):
    """A numbered grid: each tile is the photo with its number, width, licence and distance from the pin."""
    if not items: return
    W, H, cols = 320, 240, 4
    rows = (len(items) + cols - 1) // cols
    im = Image.new('RGB', (cols * W, rows * (H + 28)), 'white'); dr = ImageDraw.Draw(im)
    font = ImageFont.load_default()
    for i, it in enumerate(items):
        x, y = (i % cols) * W, (i // cols) * (H + 28)
        try:
            t = Image.open(it['thumb']).convert('RGB'); t.thumbnail((W - 6, H - 6))
            im.paste(t, (x + (W - t.width) // 2, y + (H - t.height) // 2))
        except Exception: pass
        dr.text((x + 6, y + H + 2), label(it)[:52], fill='black', font=font)
        dr.rectangle([x + 4, y + 4, x + 30, y + 22], fill='black'); dr.text((x + 9, y + 7), str(it.get('n', i + 1)), fill='white', font=font)
    im.save(path, quality=82)

def main():
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    gdir = a[0]
    maxn = int(a[a.index('--max') + 1]) if '--max' in a else 10
    only = set(a[a.index('--slots') + 1].split(',')) if '--slots' in a else None
    force = '--force' in a
    task = json.load(open(os.path.join(gdir, 'task.json')))
    cpath = os.path.join(gdir, 'candidates.json')
    cands = json.load(open(cpath)) if os.path.exists(cpath) else {}
    os.makedirs(os.path.join(gdir, 'sheets'), exist_ok=True)
    unresolved_all = cands.get('_unresolved', {})
    n_slots = n_c = n_empty = 0
    for sl in task['slots']:
        if sl['status'] != 'search' or (only and sl['slot'] not in only): continue
        if sl['slot'] in cands and not force and sl['slot'] not in unresolved_all: continue
        ctx = slot_context(sl)
        if not ctx: unresolved_all[sl['slot']] = ['place not found in src/data']; continue
        un = []
        items = gather(sl, ctx, maxn, un)
        cands[sl['slot']] = items
        if un: unresolved_all[sl['slot']] = un
        else: unresolved_all.pop(sl['slot'], None)
        safe = re.sub(r'[^a-z0-9]+', '-', sl['slot'].lower())
        sheet(items, os.path.join(gdir, 'sheets', safe + '.jpg'),
              lambda it: f"{it['width']}px {it['licence'][:12]} {(str(it['dist_m']) + 'm') if it['dist_m'] is not None else ''} {it['source'][:14]}")
        n_slots += 1; n_c += len(items); n_empty += 0 if items else 1
    # The current photos of the confirm slots, on one sheet for the first judge.
    conf = []
    for sl in task['slots']:
        if sl['status'] != 'confirm' or not (sl.get('current') or {}).get('file') or sl['current']['file'].startswith('external:'): continue
        p = fileinfo([sl['current']['file']]).get(sl['current']['file'])
        if not p: continue
        ii = p['imageinfo'][0]
        st, raw = get(ii.get('thumburl'), binary=True)
        if raw is None: continue
        conf.append({'n': len(conf) + 1, 'slot': sl['slot'], 'width': ii['width'],
                     'thumb': os.path.join(CACHE, 'thumbs', hashlib.sha1(ii['thumburl'].encode()).hexdigest() + '.jpg')})
    sheet(conf, os.path.join(gdir, 'sheets', 'confirm.jpg'), lambda it: f"{it['slot'][5:]} {it['width']}px")
    if conf: cands['_confirm_sheet'] = [{'n': c['n'], 'slot': c['slot']} for c in conf]
    cands['_unresolved'] = unresolved_all
    json.dump(cands, open(cpath, 'w'), indent=1, ensure_ascii=False)
    print(f'{gdir}: {n_slots} search slots, {n_c} candidates, {n_empty} with none, {len(unresolved_all)} with unresolved sources, {len(conf)} confirm photos on sheets/confirm.jpg')

if __name__ == '__main__':
    main()
