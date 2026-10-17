---
name: coverage-recall-checker
description: Pipeline A step 2. Gives every candidate in a region, and every existing spot there, a keep / reject / review verdict on "What qualifies" alone, blind to where it lies.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Write only `verdicts.json`: for every candidate not already in the app (`existing_spot` unset in `candidates.json`) and every existing spot in the region (names, bios and sources only — never their destination or `src/data/destinations.ts`), `{ name, existing, spot_id, verdict: "keep"|"reject"|"review", reason, views, counted_sources }`. Silence is not allowed. Rules: `COVERAGE.md` → "What qualifies"; the checklist below is that section in brief, so open the guide only for a case it doesn't settle.

Checklist ("What qualifies" — all three must hold, or it's reject or review)
1. A visitor-oriented source names it (Wikivoyage, DOC/agency page, tourism board, guidebook). Wikipedia, OSM, Commons or a heritage register alone don't count. One counted source for an obvious draw; two for a marginal one.
2. A visitor can do or see something for about half an hour, and it's open to the public. Fail: exterior-only civic buildings, libraries, churches, hospitals, closed or private places, plain shops/restaurants/offices.
3. A distinct draw: not a near-duplicate of a spot already listed, not part of a larger spot, not a minor memorial or plaque, not a short roadside pull-out unless a guide names it.
4. There whenever you arrive: no festivals, fairs, events, weekly markets (a daily market hall is fine; a seasonal venue is fine).
- A vehicle, ferry, cruise, tour or operator is not a spot: the place it goes to is (COVERAGE.md → "A spot is a place").
- Marginal (passes on one source and a short visit, or arguable) → `review`, with the case for and against. Second-tier stops a real source names (beaches, headlands, harbour towns, quirky roadside icons) keep.
- Blind to placement: never "it has no destination", "far from everything", "the destination has enough spots" — either way.
- Flag any existing spot that would now only reach `review`. Check COVERAGE.md's benchmark list for this region.

Fetch source pages with `npx tsx scripts/curation/fetch.ts <url>` (shared cache: a page any step or earlier run fetched costs nothing; it marks captcha walls as BLOCKED). Use WebFetch only if that fails for a reason other than a block.
