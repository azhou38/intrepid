#!/usr/bin/env python3
"""Builds src/data/worldCountriesDetail.json: Natural Earth 1:10m country outlines for the zoomed Explored map.

The world-wide map (worldCountries.json, 1:50m, one decimal) turns crude once the map zooms in on a country, so this set keeps
two decimals and a much finer simplification. Same projection as ProfileScreen (x = lon + 180, y = MILLER_TOP - miller(lat)).
Each entry is { c: ISO code, b: [x0, y0, x1, y1] bounding box, d: SVG path } so the app only draws what is in view.

Usage: python3 scripts/build-world-detail.py <ne_10m_admin_0_countries.geojson>
  (from https://github.com/nvkelso/natural-earth-vector, geojson/ne_10m_admin_0_countries.geojson; public domain)
"""
import json, math, sys

TOL = 0.03   # simplification tolerance in map units (a degree is one unit); well under a pixel at the tightest zoom
MIN_RING = 0.06  # drop rings smaller than this in both directions (specks)

def miller(lat):
    phi = math.radians(max(-89.9, min(89.9, lat)))
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * phi)) * 180 / math.pi

TOP = miller(84)
def proj(lon, lat): return (lon + 180, TOP - miller(lat))

def rdp(pts, tol):
    n = len(pts)
    if n < 3: return pts
    keep = [False] * n; keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0: d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                u = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2
            if d > best: best, bi = d, i
        if best > t2:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def main(path):
    feats = json.load(open(path))['features']
    out = {}
    for f in feats:
        code = f['properties'].get('ISO_A2_EH') or f['properties'].get('ISO_A2')
        if not code or code == '-99': continue
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            for ring in poly:
                pts = [proj(lon, lat) for lon, lat in ring]
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                if max(xs) - min(xs) < MIN_RING and max(ys) - min(ys) < MIN_RING: continue
                s = rdp(pts, TOL)
                if len(s) < 4: continue
                e = out.setdefault(code, {'c': code, 'b': [1e9, 1e9, -1e9, -1e9], 'p': []})
                e['b'] = [min(e['b'][0], min(xs)), min(e['b'][1], min(ys)), max(e['b'][2], max(xs)), max(e['b'][3], max(ys))]
                e['p'].append('M' + ' '.join(f'{x:.2f} {y:.2f}' for x, y in s) + 'Z')
    res = [{'c': e['c'], 'b': [round(v, 1) for v in e['b']], 'd': ''.join(e['p'])} for e in out.values()]
    json.dump(res, open('src/data/worldCountriesDetail.json', 'w'), separators=(',', ':'))
    print(len(res), 'countries,', sum(len(r['d']) for r in res) // 1024, 'KB of paths')

main(sys.argv[1])
