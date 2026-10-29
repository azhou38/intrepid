#!/usr/bin/env python3
"""Collects the photo slots that need a NEW photo into one queue file for the image searcher (Pipeline B step 2).

  python3 scripts/curation/build-search-queue.py <out.json> <region-id>... [--branch nz-rest] [--country NZ] [--shard 10]

Sources, under curation/<branch>/ (default nz-rest, country NZ): every search slot the gather script found no candidates for
(lens/<group>/candidates.json), the first judge's rejects and "none" verdicts (lens/<group>/judge-1.json), and the spots Quill
wrote but held for lack of a photo (`held` in quill/<region>/final.json,
with their placement entry for name/destination/reason). Each queue entry: { slot, kind: "reject"|"held", name, region,
destination, what_to_show, current_file, failed_check, why, where: manifest key / override key, leads }.

Run it after the first judge, so the queue is only what the gather script (Commons and Google Images together) and that
judge left empty. Each entry carries `leads`, a starting list so the searcher checks pages instead of hunting:
  google_pages   the pages Google Images found for the slot (the gather script's cached results), official tourism and
                 parks sites first, excluded hosts dropped (scripts/curation/photo-sources.json), at most 10
  sitemap_pages  pages on the official sites seen in this queue's Google results whose address holds the place's whole
                 name, then those holding its distinctive words, from each site's sitemap.xml (cached 14 days), at most 5
  tried          what the script already searched for the slot: candidates by source, and its unresolved sources
--shard N (default 10) also writes <out>-01.json, <out>-02.json … of N slots each, one searcher per shard, run in parallel.
(On the Victor Harbor test, two searchers of 5 slots each cost more than one of 10: each pays its own start-up.)

  python3 scripts/curation/build-search-queue.py --merge <out.json> [--branch nz-rest]
files the searchers' <out>-NN.out.json in each group's candidates-search.json for the first judge, and names any shard
with no output.
"""
import glob, hashlib, importlib.util, json, os, re, sys, time, urllib.parse, urllib.request
args = sys.argv[1:]
if args and args[0] == '--merge':
    # The searchers' shard outputs (<queue>-NN.out.json) → each group's candidates-search.json, numbered, for the first
    # judge on the searchers' finds (judge-1-search.json; second-judge.py reads both files).
    qpath = args[1]; stem = re.sub(r'\.json$', '', qpath)
    where = {q['slot']: q for q in json.load(open(qpath))}
    branch = args[args.index('--branch') + 1] if '--branch' in args else 'nz-rest'
    per, missing = {}, []
    shard_files = sorted(f for f in glob.glob(stem + '-[0-9][0-9].json'))
    for sf in shard_files:
        of = sf[:-5] + '.out.json'
        if not os.path.exists(of): missing.append(of); continue
        for slot, finds in json.load(open(of)).items():
            g = (where.get(slot) or {}).get('destination')
            if not g: continue
            per.setdefault(g, {})[slot] = [dict(x, source='searcher', n=i) for i, x in enumerate(finds, 1)]
    for g, d in per.items():
        f = f'curation/{branch}/lens/{g}/candidates-search.json'
        cur = json.load(open(f)) if os.path.exists(f) else {}
        cur.update(d); json.dump(cur, open(f, 'w'), indent=1, ensure_ascii=False)
    n = sum(len(v) for d in per.values() for v in d.values())
    print(f'{n} finds in {sum(len(d) for d in per.values())} slots -> {len(per)} candidates-search.json files'
          + (f'; MISSING shard output: {", ".join(missing)}' if missing else ''))
    sys.exit(2 if missing else 0)
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
BRANCH, COUNTRY = opt('--branch', 'nz-rest'), opt('--country', 'NZ')
out = args[0]
regions = [a for i, a in enumerate(args[1:], 1) if not a.startswith('--') and args[i - 1] not in ('--branch', '--country', '--groups', '--shard')]
regdef = {x['id']: x for x in json.load(open('scripts/coverage-regions.json'))[COUNTRY]}
queue = []
for r in regions:
    for g in regdef[r]['destinations'] + (['standalone'] if regdef[r].get('standalone') else []):
        cf = f'curation/{BRANCH}/lens/{g}/candidates.json'
        if os.path.exists(cf):   # nothing found by the script: no judge, straight to the searcher
            for slot, v in json.load(open(cf)).items():
                if not slot.startswith('_') and v == []:
                    queue.append({'slot': slot, 'kind': 'empty', 'region': r, 'destination': g, 'why': 'gather script found no candidates'})
        f = f'curation/{BRANCH}/lens/{g}/judge-1.json'
        if not os.path.exists(f):
            continue
        j = json.load(open(f))
        for slot, v in j.get('slots', j).items():
            if isinstance(v, dict) and (v.get('decision') == 'reject' or str(v.get('choice') or '').startswith('none')) and not any(q['slot'] == slot for q in queue):
                queue.append({'slot': slot, 'kind': 'reject', 'region': r, 'destination': g, 'failed_check': v.get('failed_check'),
                              'why': (v.get('candidates') or [{}])[0].get('reason') if v.get('candidates') else None})
    fin = f'curation/{BRANCH}/quill/{r}/final.json'
    pl = f'curation/{BRANCH}/region-{r}/placement.json'
    if os.path.exists(fin) and os.path.exists(pl):
        final = json.load(open(fin)); place = json.load(open(pl))
        key = next(k for k in ('placements', 'places', 'spots', 'new_spots') if k in place)
        byid = {e['id']: e for e in place[key] if 'id' in e}
        held = list(final.get('held', [])) + [e['id'] for e in place[key] if 'held' in str(e.get('status') or '') and e['id'] in final['spots'] and e['id'] not in final.get('held', [])]
        for sid in held:
            sid = sid.get('id') if isinstance(sid, dict) else sid   # newer runs list held spots as {id, reason}
            e = byid.get(sid) or {}
            q = final['spots'].get(sid) or {}
            queue.append({'slot': f'spot:{sid}', 'kind': 'held', 'region': r, 'destination': e.get('destination'),
                          'name': q.get('name') or e.get('name'), 'category': q.get('category') or e.get('category'),
                          'coordinates': q.get('coordinates') or e.get('coordinates'), 'why': e.get('status'),
                          'photo_note': (e.get('photo') or {}).get('file')})
SKIP = {'spot:gisborne-3', 'spot:gisborne-10', 'spot:ruahine-forest-park', 'spot:yeomans-track', 'spot:faraday-museum'}   # removed or held for access reasons, not photos
queue = [q for q in queue if q['slot'] not in SKIP]

# Leads: what the scripts already know about each slot.
spec = importlib.util.spec_from_file_location('gather', os.path.join(os.path.dirname(__file__), 'gather-photo-candidates.py'))
gather = importlib.util.module_from_spec(spec); spec.loader.exec_module(gather)
SMCACHE = os.path.join('.cache', 'curation', 'sitemaps'); os.makedirs(SMCACHE, exist_ok=True)

def google_cached(ctx):
    f = os.path.join(gather.GCACHE, hashlib.sha1(gather.google_query(ctx).encode()).hexdigest() + '.json')
    return json.load(open(f)) if os.path.exists(f) else []

def official(h):
    return any(h == d or h.endswith('.' + d) for d in gather.SOURCES['official_with_permission'])

def sitemap(host):
    """Every page address in a site's sitemap.xml, following a sitemap index (at most 30 child sitemaps)."""
    f = os.path.join(SMCACHE, host + '.json')
    if os.path.exists(f) and time.time() - os.path.getmtime(f) < 14 * 86400: return json.load(open(f))
    urls, todo, n = [], [f'https://{host}/sitemap.xml', f'https://www.{host}/sitemap.xml'], 0
    while todo and n < 31:
        u = todo.pop(0); n += 1
        try:
            x = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 ' + gather.UA}), timeout=25).read().decode('utf-8', 'replace')
        except Exception:
            continue
        locs = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', x)
        if '<sitemapindex' in x: todo += locs
        else: urls += locs
        if urls and u.endswith('/sitemap.xml') and 'www.' not in u: todo = [t for t in todo if not t.endswith(f'www.{host}/sitemap.xml')]
    json.dump(urls, open(f, 'w'))
    return urls

ctxs = {q['slot']: gather.slot_context({'slot': q['slot']}) for q in queue}
sites = sorted({gather.host(r.get('link')) for c in ctxs.values() if c for r in google_cached(c)} - {''})
sites = [h for h in sites if official(h)]
maps = {h: sitemap(h) for h in sites}
for q in queue:
    ctx = ctxs.get(q['slot'])
    if not ctx: continue
    pages, seen = [], set()
    for r in google_cached(ctx):
        h, link = gather.host(r.get('link')), r.get('link')
        if not h or link in seen or any(x in h for x in gather.SOURCES['excluded']): continue
        seen.add(link); pages.append({'site': h, 'page': link, 'title': (r.get('title') or '')[:80], 'official': official(h)})
    pages.sort(key=lambda p: not p['official'])
    words = [re.sub(r"'", '', w) for w in gather.name_words(ctx['name'])]
    slug = '-'.join(re.findall(r'[a-z0-9]+', re.sub(r"[ʻ'’]", '', ctx['name'].lower())))
    def score(u):   # 2: the address holds the whole name ("hindmarsh-falls"); 1: its distinctive words only
        s = urllib.parse.unquote(u).lower()
        return 2 if slug and slug in s else 1 if words and all(w in s for w in words) else 0
    sm, last = [], set()
    for u in sorted((u for us in maps.values() for u in us), key=lambda u: -score(u)):
        if score(u) == 0 or len(sm) >= 5: break
        k = u.rstrip('/').rsplit('/', 1)[-1]
        if k in last: continue
        last.add(k); sm.append(u)
    tried = {}
    cf = f'curation/{BRANCH}/lens/{q.get("destination")}/candidates.json'
    if os.path.exists(cf):
        c = json.load(open(cf))
        for x in c.get(q['slot'], []) if isinstance(c.get(q['slot']), list) else []:
            tried[x.get('source', '?')] = tried.get(x.get('source', '?'), 0) + 1
        un = (c.get('_unresolved') or {}).get(q['slot'])
        if un: tried['unresolved'] = un
    q['name'] = q.get('name') or ctx['name']
    q['leads'] = {'google_pages': pages[:10], 'sitemap_pages': sm, 'tried': tried}

json.dump(queue, open(out, 'w'), indent=1, ensure_ascii=False)
size = int(opt('--shard', '10'))
stem = re.sub(r'\.json$', '', out)
shards = [queue[i:i + size] for i in range(0, len(queue), size)]
for i, s in enumerate(shards, 1):
    json.dump(s, open(f'{stem}-{i:02d}.json', 'w'), indent=1, ensure_ascii=False)
n_lead = sum(1 for q in queue if q.get('leads', {}).get('google_pages') or q.get('leads', {}).get('sitemap_pages'))
print(f'{len(queue)} slots -> {out} ({len(shards)} shards of up to {size}); {n_lead} with leads; sitemaps read: {", ".join(f"{h} ({len(u)})" for h, u in maps.items()) or "none"}')
