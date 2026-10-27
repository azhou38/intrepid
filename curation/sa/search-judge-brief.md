# SA run: brief for the external-photo judges (Lens, spot slots)

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Role: .claude/agents/image-judge.md; rules: IMAGES.md (the four checks,
"A photo shows the place itself, or the place has no photo", "Keeping the subject in the crop", licence). Your batch folder: `curation/sa/search/<B>/` with
`in.json` (the spot slots: name, destination, category, bio, coordinates, why it failed on Commons) and `candidates.json` ({ slot: [ {local, url, page, width, height,
licence, by, source, note} ] }, local = a downloaded file path from the repo root; an empty list = nothing was found, record `none`).
For EVERY slot in in.json with candidates: open each candidate image with the Read tool (look at it; do not judge by file name), and where its page is a
Commons/Flickr/official page and you can load it, check the caption/geotag/categories (`npx tsx scripts/curation/fetch.ts <url>`; a failed fetch is not evidence against the photo,
note that you judged from the image alone). Run the four checks: (1) right place (not a same-named place elsewhere), (2) shows the named thing itself, not a neighbouring
sight, sign, car park or stand-in, (3) a good, wide, well-lit real photograph (no map, drawing, archive/B&W scan; people or animals in frame fine when the place is the
subject), (4) real photo of the real place; plus: width >= 960, current colour, no watermark/overlay, free licence (CC0/BY/BY-SA, or an official photo whose licence says
"official photo, permission not confirmed": acceptable, flagged), NOT a non-free ND/NC licence (mark such a candidate `licence-hold`, never choose it). The spot's subject must be
its own: a photo of another spot of the same area (see the spot names in `curation/sa/search/*/in.json` of neighbours if unsure) fails. Pick the best passing candidate
as `choice` (its `local` path) or `none: <why>`. For a choice whose aspect is outside 0.8-1.25 or whose subject is off-centre, run
`python3 scripts/curation/hero-crop.py <local file> --x X --y Y [--zoom Z]` (it writes a crop image to look at; delete any stray hero-crop.jpg it leaves in the repo root)
and record `hero_crop`: "ok" or {x,y,zoom?}; if no crop keeps the subject recognisable, the candidate fails.
Write `curation/sa/search/<B>/judge-1.json` = { "<slot>": { "decision": "choice|none", "choice": "<local path>" | "none: <why>", "licence": "...", "hero_crop": "ok"|{x,y,zoom?},
"reason": "<one line: what the photo shows and which checks it passes>" } } for every slot, then validate it parses. Final message: at most 6 lines (path; counts choice/none;
any candidate you held for licence).
