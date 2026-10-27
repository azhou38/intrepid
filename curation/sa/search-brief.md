# SA run: external photo search for spot slots (image-searcher)

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Role: .claude/agents/image-searcher.md; rules: IMAGES.md
(four checks, 'When Commons has no suitable photo', 'Spot photos'). Do NOT edit src/ or git. Your input: `curation/sa/search/<B>/in.json`, a list of
spot slots: { slot, id, name, wiki, destination, category, coordinates, bio, failed }. `failed` says why the Commons photo was rejected
or missing; Commons was already searched (candidates for the slot are in curation/sa/lens-spots/<destination-folder>/candidates.json: do not repeat them).

For each slot find up to 4 candidate photos of the place ITSELF (not a neighbour, not a same-named place elsewhere, not a stand-in; current colour
photo; >= 960 px wide; free licence preferred), searching in this order, stopping at the first tier that gives 2+ good candidates:
1. Openverse (`python3 scripts/openverse-search.py`, see its --help), qualified with the region ("Ceduna, South Australia"), CC0/BY/BY-SA preferred.
2. Official / tourism pages: parks.sa.gov.au park pages, southaustralia.com, the regional tourism board, the council or operator site (license: "official photo,
   permission not confirmed"). Fetch with `npx tsx scripts/curation/fetch.ts <url>`; read <img> srcs and alt text; drop size suffixes (e.g. -768x576) for the original.
3. Wikimedia Commons categories/geosearch only if the earlier pass clearly missed the place (rare).
A script-blocked page (403, 'Just a moment'): list under needs_browser with its URL; do not skip silently.
Download each candidate with `curl -sL -A "Mozilla/5.0" -o curation/sa/search/<B>/img/<id>-<n>.jpg <url>`, check its real pixel size
(`python3 -c "from PIL import Image;print(Image.open(p).size)"`), delete anything under 960 px wide. Never invent a URL: only download a URL a page or API returned.
Write `curation/sa/search/<B>/candidates.json` = { "<slot>": [ { local, url, page, width, height, licence, by, source, note } ] } (empty list = nothing found, with the
sources tried in `_tried`: { "<slot>": "…" }). Final message (max 6 lines): counts found/none, needs_browser items.
