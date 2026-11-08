#!/usr/bin/env python3
"""Pin candidates for a spot in a country whose OpenStreetMap names are not Latin (China): finds the place's Chinese name, then
looks it up in OpenStreetMap through Nominatim and in Wikidata, so resolve-pin.py's English-name matching is not needed.

  python3 scripts/curation/resolve-pin-zh.py <spots-input.json> <out.json> [shard nshards]

Input: a list of { id, name, wiki?, category, coordinates? { lat, lng } } (hint, optional), plus optional `zh` (a Chinese name to use
instead of the Wikipedia language link). For each spot it records:
  zh        the Chinese name (English Wikipedia langlink, or the given one)
  wikidata  the item's P625 coordinates (a reference; often accurate for Chinese sites, sometimes a town point)
  osm       Nominatim results for the Chinese name (class/type, display name, point, distance from the hint)
  confidence HIGH = Wikidata and an OSM feature within 100 m of each other; MEDIUM = one OSM feature of a precise type whose name
             contains the Chinese name (or Wikidata with 5+ decimals and within 3 km of the hint); LOW otherwise
Never writes src/data. Paced at one Nominatim call per second. Resumable."""
import json, math, os, sys, time, urllib.parse, urllib.request

UA = 'IntrepidApp-Curation/1.0 (pin resolution)'
src, out = sys.argv[1], sys.argv[2]
shard, nshards = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (0, 1)
PRECISE = {'tourism': {'attraction', 'museum', 'viewpoint', 'gallery', 'zoo', 'theme_park'}, 'historic': None, 'natural': {'peak', 'beach', 'water', 'bay', 'cave_entrance'},
           'leisure': {'park', 'garden', 'nature_reserve'}, 'amenity': {'place_of_worship'}, 'building': None, 'waterway': {'waterfall'}, 'man_made': None}


def get(url):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30))
        except Exception:
            time.sleep(2 + 3 * i)
    return None


def km(a, b):
    r = math.radians
    h = math.sin(r(b[0] - a[0]) / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def zh_and_wikidata(title):
    q = urllib.parse.quote(title.replace(' ', '_'))
    d = get(f'https://en.wikipedia.org/w/api.php?action=query&titles={q}&prop=langlinks|pageprops&lllang=zh&ppprop=wikibase_item&redirects=1&format=json')
    if not d:
        return None, None
    p = next(iter(d['query']['pages'].values()))
    zh = (p.get('langlinks') or [{}])[0].get('*')
    qid = (p.get('pageprops') or {}).get('wikibase_item')
    coords = None
    if qid:
        w = get(f'https://www.wikidata.org/w/api.php?action=wbgetclaims&entity={qid}&property=P625&format=json')
        try:
            v = w['claims']['P625'][0]['mainsnak']['datavalue']['value']
            coords = [v['latitude'], v['longitude']]
        except Exception:
            pass
    return zh, coords


done = json.load(open(out)) if os.path.exists(out) else {}
spots = json.load(open(src))
for i, s in enumerate(spots):
    if i % nshards != shard or s['id'] in done:
        continue
    hint = [s['coordinates']['lat'], s['coordinates']['lng']] if s.get('coordinates') else None
    zh, wd = (None, None)
    for t in filter(None, [s.get('wiki'), s['name']]):
        zh, wd = zh_and_wikidata(t)
        if zh or wd:
            break
    zh = s.get('zh') or zh
    osm = []
    if zh:
        time.sleep(1)
        vb = ''
        if hint:
            vb = f'&viewbox={hint[1]-0.6},{hint[0]+0.6},{hint[1]+0.6},{hint[0]-0.6}&bounded=0'
        res = get('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=zh&q=' + urllib.parse.quote(zh) + '&countrycodes=cn' + vb) or []
        for r in res:
            p = [float(r['lat']), float(r['lon'])]
            osm.append({'class': r.get('category'), 'type': r.get('type'), 'name': r.get('display_name', '')[:80], 'lat': p[0], 'lon': p[1],
                        'from_hint_km': round(km(hint, p), 1) if hint else None})
    near = [o for o in osm if hint is None or o['from_hint_km'] <= 40]
    conf, rec = 'LOW', None
    if near:
        best = near[0]
        if wd and km(wd, [best['lat'], best['lon']]) <= 0.1:
            conf, rec = 'HIGH', best
        elif best['class'] in PRECISE and (PRECISE[best['class']] is None or best['type'] in PRECISE[best['class']]) and zh and zh in best['name']:
            conf, rec = 'MEDIUM', best
        else:
            rec = best
    elif wd and (hint is None or km(wd, hint) <= 40):
        rec = {'class': 'wikidata', 'type': 'P625', 'lat': wd[0], 'lon': wd[1]}
        if len(str(wd[0]).split('.')[-1]) >= 5:
            conf = 'MEDIUM'
    done[s['id']] = {'name': s['name'], 'zh': zh, 'wikidata': wd, 'osm': osm, 'confidence': conf, 'recommended': rec}
    json.dump(done, open(out, 'w'), indent=1, ensure_ascii=False)
print(f'shard {shard}: {len(done)} done')
