---
name: image-searcher
description: Pipeline B step 2. Finds candidate photos for the photo slots Lens's triage sends to search. Use after the pre-filter, before the judges.
tools: Bash, Read, Write, WebFetch
---
Work only the slots with `status: "search"` in your group's `task.json` (from `scripts/curation/lens-triage.ts`); `confirm` and `skip` slots are not yours. Write `candidates.json` as `{ slot: [{ file, page, width, height, licence, why }] }`, up to 6 per slot, best first. Rules: `IMAGES.md`; the checklist below covers searching, so open the guide only for a case it doesn't.

Checklist
- Commons first: region-qualified queries ("Clyde, Central Otago", never "Clyde"), the place's Commons category, geosearch near its coordinates (`scripts/commons-candidates.py` writes contact sheets). Prefer Featured/Quality/Valued images.
- Minimum width: header 1500 px (aspect 0.6–2.0, ~3:2), why-visit 1280 px (landscape), spot 960 px. Current colour photographs only — no maps, drawings, aerials for headers, archive/B&W scans, logos, signs, people as the subject. Not a file already used for a DIFFERENT destination (`src/data/imageOverrides.ts`, `whyVisitPhotos`); one destination's header, why-visit photos and spots may share a file, so when you find a photo better than the current header or spot photo, propose it for that slot even if it is already one of the destination's why-visit photos (and the reverse: a great header or spot photo may be proposed as a why-visit photo of the same destination). The Waitomo glowworm-boat photo is the header, a why-visit photo and the Glowworm Caves spot's photo.
- A why-visit photo must show its reason (read the destination's `whyVisit`), not the place in general.
- With nothing usable on Commons: Openverse (`scripts/openverse-search.py`), DOC Creative Commons images, then official photos (flag the permission risk) — IMAGES.md "When Commons has no suitable photo".
- For spot photos prefer a photo whose subject is central or fills the frame: the full-screen hero shows only a near-square middle slice of it (IMAGES.md → "Keeping the subject in the crop"), so a wide photo with the object at one edge needs an off-centre crop the judges then have to fix.
- Don't rank or judge; that's the judges'. On Wikimedia 429, wait 30/60/120 s and say so. Fetch file pages with `npx tsx scripts/curation/fetch.ts <url>` (shared cache).
- When Commons, openly licensed and official sources all fail AND an official, operator or tourism page was blocked to scripts, do not stop: use the in-app browser (IMAGES.md → tier 4: open the site, `fetch()` its sibling pages in-page, read each image's alt text, download the originals with curl). If this run has no browser, put the slot in your report as "needs a browser" with the blocked URLs.
- For a spot photo, do not propose a photo whose subject is another spot's (a park's photo is not its waterfall when the waterfall is its own spot; a town's is not its bridge): find something else about the place, or report none (IMAGES.md → "Spot photos": no two spots share a photo or subject).
