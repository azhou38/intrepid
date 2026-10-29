#!/usr/bin/env python3
"""The image-searcher's page reader (PIPELINES.md → Pipeline B step 2): prints a page's photos in a few lines, so the
agent never reads page text. Fetching a page with WebFetch puts its whole text into the agent's context; this prints only
what a photo search needs.

  python3 scripts/curation/page-images.py <url> [--min 960] [--max 12]

Prints the page title, then one line per photo at least --min px wide (default 960): "<w>x<h>  <url>  <caption>", the
page's main photo (og:image) first, then the large images in page order (the first 30 distinct images), each at its
original size (the URL without its resize query when the CDN serves that) and measured from its first 64 KB (cached in
.cache/curation/pageimg/). A page that refuses scripts (403, 429, a Cloudflare or bot check) prints "BLOCKED <status>
<url>" and exits 3: list it for the browser step, never as "no photo".
"""
import hashlib, html, io, os, re, sys, urllib.parse, urllib.request
from PIL import Image

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
CACHE = os.path.join('.cache', 'curation', 'pageimg')
os.makedirs(CACHE, exist_ok=True)
SKIP = re.compile(r'logo|icon|sprite|avatar|badge|placeholder|spinner|blank|pixel|tracking|\.svg(\?|$)|/flags?/', re.I)


def fetch(url, binary=False):
    """A page, or the first 64 KB of an image (enough for its size), cached."""
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ('.bin' if binary else '.html'))
    if os.path.exists(f): return 200, open(f, 'rb').read()
    headers = {'User-Agent': UA}
    if binary: headers['Range'] = 'bytes=0-65535'
    try:
        body = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25).read()
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None
    open(f, 'wb').write(body)
    return 200, body


def attr(tag, name):
    m = re.search(r'\b' + name + r'\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))', tag, re.I)
    return html.unescape(next(g for g in m.groups()[1:] if g is not None)) if m else None


def largest_from_srcset(s):
    best, bw = None, -1
    for part in (s or '').split(','):
        bits = part.strip().split()
        if not bits: continue
        w = int(re.sub(r'\D', '', bits[1]) or 0) if len(bits) > 1 and bits[1].endswith('w') else 0
        if w >= bw: best, bw = bits[0], w
    return best


def size_of(url):
    st, body = fetch(url, binary=True)
    if not body: return None
    try:
        return Image.open(io.BytesIO(body)).size
    except Exception:
        return None


def original(url):
    """(url, size) of the largest version: the URL without its resize query (CDNs such as ATDW and Umbraco serve the
    original there), else the URL as given."""
    bare = re.sub(r'\?.*$', '', url)
    for u in ([bare, url] if bare != url else [url]):
        s = size_of(u)
        if s: return u, s
    return url, None


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith('-'): sys.exit(__doc__)
    url, minw = a[0], int(a[a.index('--min') + 1]) if '--min' in a else 960
    maxn = int(a[a.index('--max') + 1]) if '--max' in a else 12
    st, body = fetch(url)
    text = body.decode('utf-8', 'replace') if body else ''
    if st != 200 or re.search(r'Just a moment|cf-chl|challenge-platform|captcha|Access denied', text[:20000], re.I):
        print(f'BLOCKED {st} {url}'); sys.exit(3)
    title = html.unescape(re.sub(r'\s+', ' ', (re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S) or [None, ''])[1])).strip()
    found = []   # (src, caption)
    for m in re.finditer(r'<meta[^>]+>', text, re.I):
        t = m.group(0)
        if (attr(t, 'property') or attr(t, 'name') or '').lower() in ('og:image', 'twitter:image'):
            found.append((attr(t, 'content'), 'main photo'))
    for m in re.finditer(r'<(img|source)\b[^>]*>', text, re.I):
        t = m.group(0)
        src = largest_from_srcset(attr(t, 'srcset') or attr(t, 'data-srcset')) or attr(t, 'data-src') or attr(t, 'data-lazy-src') or attr(t, 'src')
        found.append((src, attr(t, 'alt') or attr(t, 'title') or ''))
    # The page's own gallery usually sits on the same image host as its main photo (an ATDW listing's photos on
    # assets.atdw-online.com.au), while menus and "you may also like" cards use the site's own media folder: list the
    # main photo's host first, then the rest in page order.
    main_host = urllib.parse.urlparse(urllib.parse.urljoin(url, found[0][0])).netloc if found and found[0][0] else None
    if main_host:
        found.sort(key=lambda f: urllib.parse.urlparse(urllib.parse.urljoin(url, f[0] or '')).netloc != main_host)
    seen, rows = set(), []
    for src, cap in found:
        if not src or src.startswith('data:'): continue
        full = urllib.parse.urljoin(url, src)
        key = re.sub(r'[?#].*$', '', full)
        if key in seen or SKIP.search(full): continue
        seen.add(key)
        if len(seen) > 30: break   # a page's own photos come before its "you may also like" cards
        full, size = original(full)
        if not size or size[0] < minw: continue
        cap = re.sub(r'\s+', ' ', cap).strip()[:90]
        rows.append(f'{size[0]}x{size[1]}  {full}  {cap}')
        if len(rows) >= maxn: break
    print(title[:120] or '(no title)')
    print('\n'.join(rows) if rows else f'no photo at least {minw} px wide on this page')


if __name__ == '__main__':
    main()
