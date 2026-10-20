#!/usr/bin/env python3
"""Lens's photo proof (PIPELINES.md → "Cost and speed"): let a script prove the place, and send a judge only what it cannot prove.

  python3 scripts/curation/photo-prove.py <group>/task.json [--sample 8] [--min-width 960]

For every `confirm` slot of a spot whose current photo is a Commons file, it asks the Commons API for the file's geotag, size,
date and categories, and downloads a 320 px thumbnail to measure colour. A photo is PROVEN only when ALL hold:
  - it is geotagged within 300 m of the spot's pin;
  - its title, description or categories contain a distinctive word of the spot's name (so it shows the named thing, not just
    something nearby: the geotag alone cannot tell the lake from the car park beside it);
  - no excluded category (maps, drawings, paintings, satellite, historical, black and white, logos, ...), taken in 2000 or later
    (or undated and not from an archive), at least --min-width pixels wide;
  - colour: mean saturation > 0.08 (a grey or sepia scan fails). Brightness below the floor does not fail it: the reconciler brightens.
It rewrites the task.json statuses: proven → `proven` (no judge; record-verdicts.ts records it as accepted by "script"),
a hard failure (excluded category, too small, archive date, grey) → `search`, everything else (no geotag, name not found,
non-Commons photo, API error) stays `confirm` for the judge. Quality guard: every Nth proven slot (--sample, default 8) goes back to
`confirm` with the flag "audit sample", so a judge still looks at a slice of what the script accepted; if the judge rejects any of
them, rerun the group with --sample 1 (everything judged). The second, blind judge on proposed replacements is unchanged.
"""
import io, json, math, re, sys, time, urllib.parse, urllib.request
from PIL import Image

args = sys.argv[1:]
path = args[0]
def opt(name, default):
    return type(default)(args[args.index(name) + 1]) if name in args else default
SAMPLE = opt('--sample', 8); MIN_W = opt('--min-width', 960)
UA = {'User-Agent': 'IntrepidApp-Curation/1.0 (alexzhou38@gmail.com)'}
BAD_CAT = re.compile(r'\b(maps?|drawings?|paintings?|lithographs?|engravings?|illustrations?|satellite|aerial views? of|historical|history of|black and white|sepia|logos?|flags? of|coat of arms|diagrams?|floor plans?|postcards?|posters?|stamps?|renderings?)\b', re.I)
ARCHIVE = re.compile(r'(library|archives?|collection|state records)', re.I)

def get(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
        except Exception:
            time.sleep(5 * (i + 1))
    return None

def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    return 2 * 6371000 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))

def info(title):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': 'File:' + title, 'prop': 'coordinates|imageinfo|categories',
                                'iiprop': 'size|extmetadata|url', 'iiurlwidth': 320, 'cllimit': 'max'})
    raw = get('https://commons.wikimedia.org/w/api.php?' + q)
    if not raw: return None
    page = next(iter(json.loads(raw)['query']['pages'].values()))
    return page if 'imageinfo' in page else None

def colour(url):
    raw = get(url)
    if not raw: return None
    im = Image.open(io.BytesIO(raw)).convert('RGB'); w, h = im.size
    hsv = im.convert('HSV')
    return {'sat': sum(p[1] for p in hsv.getdata()) / (255 * w * h)}

# The spot's pin and name come from src/data/spots.ts (parsed, so this needs no TypeScript run).
src = open('src/data/spots.ts').read()
def spot(sid):
    m = re.search(r"\{ id: ['\"]%s['\"],[^\n]*" % re.escape(sid), src)
    if not m: return None
    l = m.group(0)
    c = re.search(r'latitude: (-?[\d.]+), longitude: (-?[\d.]+)', l); n = re.search(r'name: ("(?:[^"\\]|\\.)*"|\'[^\']*\')', l)
    return (float(c.group(1)), float(c.group(2)), n.group(1)[1:-1]) if c and n else None
STOP = {'the', 'of', 'and', 'national', 'park', 'beach', 'reserve', 'lookout', 'point', 'head', 'bay', 'mount', 'lake', 'river', 'falls', 'island', 'big', 'new', 'old', 'north', 'south', 'east', 'west', 'museum', 'gallery', 'garden', 'gardens', 'walk', 'track', 'trail', 'town', 'village'}
def words(name):
    base = re.sub(r'\([^)]*\)', '', name.lower())
    return [w for w in re.findall(r"[a-z']+", base) if len(w) > 3 and w not in STOP] or [w for w in re.findall(r"[a-z']+", base) if len(w) > 3]

task = json.load(open(path)); n = {'proven': 0, 'search': 0, 'confirm': 0}; proven = []
for sl in task['slots']:
    if sl['status'] != 'confirm' or not sl['slot'].startswith('spot:'): continue
    cur = (sl.get('current') or {}).get('file', '')
    if not cur or cur.startswith('external:'):
        sl.setdefault('proof', []).append('not a Commons file: a judge must look'); n['confirm'] += 1; continue
    sp = spot(sl['slot'][5:])
    page = info(cur)
    if not sp or not page:
        sl.setdefault('proof', []).append('spot or file not found: a judge must look'); n['confirm'] += 1; continue
    ii = page['imageinfo'][0]; md = ii.get('extmetadata', {}); hard = []
    cats = ' '.join(c['title'] for c in page.get('categories', []))
    text = ' '.join([cur, cats, md.get('ImageDescription', {}).get('value', ''), md.get('ObjectName', {}).get('value', '')]).lower()
    if BAD_CAT.search(cats) or BAD_CAT.search(cur): hard.append('excluded category or title (map/drawing/historical/...)')
    if ii['width'] < MIN_W: hard.append(f"{ii['width']} px wide (min {MIN_W})")
    d = md.get('DateTimeOriginal', {}).get('value', '') or md.get('DateTime', {}).get('value', '')
    yr = re.search(r'(1[5-9]\d\d|20\d\d)', d)
    if yr and int(yr.group(1)) < 2000: hard.append(f'dated {yr.group(1)}')
    if not yr and ARCHIVE.search(md.get('Artist', {}).get('value', '') + md.get('Credit', {}).get('value', '')): hard.append('undated archive source')
    col = colour(ii.get('thumburl', '')) if not hard else None
    if col and col['sat'] <= 0.08: hard.append('near-grey (black and white or sepia)')
    if hard:
        sl['status'] = 'search'; sl.setdefault('flags', []).extend('proof: ' + h for h in hard); n['search'] += 1; continue
    co = page['coordinates'][0] if page.get('coordinates') else None
    dist = hav((sp[0], sp[1]), (co['lat'], co['lon'])) if co else None
    named = any(w in text for w in words(sp[2]))
    if dist is not None and dist <= 300 and named:
        sl['status'] = 'proven'
        sl['proof'] = [f"geotag {int(dist)} m from the pin; a name word is in the title, description or categories; {ii['width']} px; colour ok"]
        proven.append(sl); n['proven'] += 1
    else:
        why = [] if co else ['no geotag']
        if co and dist > 300: why.append(f'geotag {int(dist)} m from the pin')
        if not named: why.append('the spot name is not in the file text')
        sl.setdefault('proof', []).append('; '.join(why) + ': a judge must look'); n['confirm'] += 1
    time.sleep(0.5)
# Quality guard: a slice of what the script accepted still goes to a judge.
for i, sl in enumerate(proven):
    if SAMPLE and i % SAMPLE == 0:
        sl['status'] = 'confirm'; sl.setdefault('flags', []).append('audit sample: the script proved this one; judge it blind'); n['proven'] -= 1; n['confirm'] += 1
json.dump(task, open(path, 'w'), indent=1, ensure_ascii=False)
print(f"{path}: {n['proven']} proven (no judge), {n['search']} fail → search, {n['confirm']} for the judge (incl. the audit sample)")
