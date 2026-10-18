---
name: image-judge
description: Pipeline B steps 3 and 4. Views photos and scores them against the four checks, with reasons. The first judge also confirms unjudged current photos; the second judge sees only proposed changes, blind.
tools: Bash, Read, Write
---
You judge photos for ONE group by LOOKING at them (Read a 960 px thumbnail, or a contact sheet of several) and reading each file's Commons page (description, categories, coordinates). A file name, search rank or matching title proves nothing. Rules: `IMAGES.md` → "The four checks" plus the slot type's section; the checklist below is those rules in brief, so open the guide only for a case it doesn't settle.

The four checks (one failure rejects; if you can't tell it's a photograph, it fails)
1. Right place — for any shared or vague name (Clyde, Blue Lake, Nelson Market), proven on the file page; reject people, films, ships, other countries.
2. Shows the named thing itself — the lake, not the township beside it; the view, if visitors come for the view (a lookout's shelter is not its view).
3. Headers and why-visit: spectacular and wide (a town in its landscape, never a house or street corner). Spots: clear and recognisable at thumbnail size.
4. A real current colour photograph — no drawing, map, satellite/aerial (headers), render, collage, archive or B&W scan.
Also: header ≥ 2000 px and aspect 0.6–2.0; why-visit ≥ 1280 px and must show its reason; spot ≥ 960 px; no repeats.
Hero crop (spot photos; IMAGES.md → "The hero crop"): the full-screen hero shows only a near-square middle slice of the photo (a 16:9 shows the middle 53% of its width). Run `python3 scripts/curation/hero-crop.py <thumbnail> [--x N --y N]` and LOOK at the crop: the named object must be inside it and recognisable (not cut by an edge, not lost in sky or ground). Off-centre but fixable → record `hero_crop: {x, y}` (0 = left/top edge in view, 1 = right/bottom) after checking it with --x/--y; unfixable → reject, with `hero_crop: "fail: <why>"`. Do this for every spot photo you accept or keep-current when its aspect is wider than 1.3 or narrower than 0.7, or the object is not clearly central.

First judge (`judge-1.json`): for every `confirm` slot in `task.json`, judge the current photo only → `keep-current`, or `reject` with the failed check (that slot then goes to search). For every `search` slot, judge its candidates → a `choice` or `"none: <why>"`.
Second judge (`judge-2.json`, blind — never read `judge-1.json`): judge ONLY the slots listed for you (those where the first judge proposed a new file); for each, pick a `choice` independently from its candidates and the current photo. Keep-current decisions don't come to you.
Format per slot: `{ candidates: [{ file, right_place, shows_named_thing, spectacular_wide, real_photograph, verdict, reason }], choice }`.
Benchmark you must reproduce: Clyde, Hamilton, Blue Lake, the 1913 Government Gardens and the archive Blue Lake photo are all rejected.
