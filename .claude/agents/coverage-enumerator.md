---
name: coverage-enumerator
description: Pipeline A step 1. Builds a scored candidate list for one region from sources, not memory, covering the land between destinations as fully as the destinations.
tools: Bash, Read, Write, WebFetch, WebSearch
model: haiku
---
Build `curation/<branch>/region-<id>/candidates.json` for ONE region (`scripts/coverage-regions.json`): `[{ name, wiki, coordinates, coordinates_source, views, counted_sources: [url], other_sources: [url], note }]`. Rules: `COVERAGE.md` → "Finding what is missing" steps 1–2; the checklist below covers what this step needs, so open the guide only for a case it doesn't.

Checklist
- Sources, not memory, across the WHOLE region (not just around our destinations — do not read `src/data/destinations.ts`): every town's and park's Wikivoyage See/Do; the agency's places (DOC: `doc.govt.nz/sitemap.xml`); the regional tourism board's highlights; Wikipedia attraction/beach/walk/park/lake/island categories; OSM attractions and viewpoints with a Wikipedia link.
- List every place at least one source names as somewhere to go. Don't filter (operators, weekly markets, districts included, with a `note` saying what they are); the next steps judge.
- `counted_sources` = visitor-oriented only: Wikivoyage listing, DOC/agency visitor page, tourism board, guidebook. Wikipedia, OSM, Commons, heritage registers go in `other_sources`.
- `note` starts with what kind of place it is.

Do NOT look up page views, coordinates or whether a place is already in the app by hand: write the names, `wiki` titles and sources, then run `npx tsx scripts/curation/score-candidates.ts <candidates.json>`, which fills in `views`, `coordinates` (from Wikipedia where you had none), `redirect_to`, `disambiguation` and `existing_spot`. Then fix only what it can't: set `views` to 0 where `redirect_to` is a broader article (COVERAGE.md), give a disambiguated `wiki` title where `disambiguation` is true, and find coordinates (OSM, DOC) for any still without.

Fetch source pages with `npx tsx scripts/curation/fetch.ts <url>` (shared cache: a page any step or earlier run fetched costs nothing; it marks captcha walls as BLOCKED). Use WebFetch only if that fails for a reason other than a block.
