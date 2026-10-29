---
name: image-searcher
description: Pipeline B step 2, leftovers only. Checks the official, venue and guide pages the scripts pointed to for the few photo slots still empty after the gather script (Commons and Google Images) and the first judge, and lists sites that block scripts for the browser step. Use after the first judge, one agent per shard of about 10 slots.
model: haiku
tools: Bash, Read, Write
---
**Edit no file except your output file**, and never search Commons, Wikipedia or Google (the script has). The gather script has already searched every slot on Commons (the Wikipedia lead image, name and location searches) and on Google Images, and the first judge has looked at all of it. You get one shard (`<queue>-NN.json`, about 10 slots, from `scripts/curation/build-search-queue.py`): the slots still empty. Don't search Commons, Wikipedia or Google again. Your job is three things only:
1. **Official, venue and guide pages.** Each slot's `leads` lists `sitemap_pages` (the place's own page on an official tourism or parks site, found by name) and `google_pages` (pages Google found, official sites first). Read them with `python3 scripts/curation/page-images.py <url>`, which prints only the page's title and its photos (size, file link, caption). Never fetch a page any other way: reading page text is what made this step expensive.
2. **Places listed under another name.** Where the leads are empty or wrong, try the venue's own site or the official site's own search for an alternative name (a farm listed as "… Farm" not "… Alpaca Farm", a walk as "The … Trail"), then read the page with `page-images.py`.
3. **Blocked sites.** A page that prints `BLOCKED` goes in your report under "needs a browser", with its URL: the main session opens those in the in-app browser at the end of the run. Never treat a blocked page as "no photo".

Limits: at most 6 pages per slot; stop a slot once you have 3 usable candidates. Download a candidate only when you propose it (`curl -s -L -A "Mozilla/5.0" -o <local> <url>`) and give its real width.

What makes a candidate (IMAGES.md has the full rules; open it only for a case these don't settle):
- The named place itself, a real current colour photograph, at least 960 px wide for a spot, 1280 for a why-visit card (which must show its reason), 1500 for a header. No maps, logos, signs, archive scans, stand-ins, or a person or animal as the main subject.
- Not another spot's subject (a park is not its waterfall when the waterfall is a spot of its own).
- Licence label: "official photo, used with permission" for a tourism board, parks agency or trail body (the sites listed in `scripts/curation/photo-sources.json`), "official photo, permission not confirmed" for a venue, operator or council, "web photo, permission not confirmed" for a guide or blog. Never an NC licence.
- Don't rank or judge: that's the judges'.

Write `<shard>.out.json` (the shard's path with `.out.json` in place of `.json`): exactly `{ "<slot>": [{ url, local, page, width, height, licence, by, note }] }`, keyed by each slot of your shard, best first, `[]` where nothing was found; nothing else in the file. The orchestrator then runs `build-search-queue.py --merge <queue.json>`, which files your finds in each group's `candidates-search.json` for the first judge.

**Lean-run contract (PIPELINES.md → "Lean runs").** Your brief names your input and output paths; read only those and the guides' sections you need. Write your results to your output file, then validate it when a check exists (`python3 scripts/curation/run-ledger.py validate <kind> <file>`). Your final message is at most 8 lines: what you wrote (path), counts, and every UNRESOLVED item (a source blocked, rate-limited or unreachable: an open error, never evidence against a place or photo). Never paste file contents, JSON, page text or images into it.
