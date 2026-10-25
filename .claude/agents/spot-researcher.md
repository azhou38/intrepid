---
name: spot-researcher
description: Pipeline C step 1. Gathers sourced facts for the entries Quill's triage flagged, including the official site.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Write only `research.json`. Research the entries in the triage file (`scripts/curation/lint-entries.ts --json`), any the owner names, and **every new spot in the run's placement.json** (each has `needs_research`, or was never researched): an existing entry that passed the lint is not yours unless told. For each, facts with a source URL each for what the flag needs (a broken or blocked link, a missing link on a paid spot, a bio to rewrite), plus hours and prices if you touch the entry. Rules: `WRITING.md` ("Writing a spot", "Voice"); the checklist covers this step.

Checklist
- coordinates: never from memory or a town/district page. Run `python3 scripts/curation/resolve-pin.py --name … --category … --lat … --lon …` and use a HIGH or MEDIUM point; for a trail, track, walk or hike pin the midpoint of the route (the tool's `trail midpoint`), not the trailhead; on LOW, take the point from the managing agency's route map and say so. Record `coordinates_source` (source and OSM feature type) and the distance moved from the placement point. Never round.
- ticketUrl: the one official site (operator, or the managing agency such as DOC for public land), found from the operator's name or a Wikipedia/Wikivoyage official link — never a guessed domain or a booking aggregator. Load it and check its title or heading names the place; take deep links from the site's own navigation. Blocked (captcha/403/checkpoint) → record it as `BLOCKED` with the URL for the orchestrator to check in a real browser; never silently drop it. A guessed deep link that 404s → search the site for the place's page before concluding there is none. Sold by many operators (cruises, flights) → none.
- Facts only from sources; hours and prices from the operator's own page where it has one; anything else `unverified`.
- Every spot you research ends with a cost: the typical adult price (`costMin`/`costMax`, `currency`) or `free: true`, and what it is for (WRITING.md → "What the cost is for"):
  - `costBasis`: `entry` (paying to get in, or free with no entry fee), `tour` (a guided tour or cruise), `ticket` (a ride or activity where being there is free: a gondola, a bungy, a jet boat), `park` (the spot IS a park and the price is its entry fee), `donation` (free, donation asked), or `open` (free with no gate, ticket or staffed entry: a town, beach, lookout, open trail; judged by the place, never from its hours).
  - `costPer` when the price is not per adult: "Adult/Day" or "Per Vehicle/Day" for a park's fee, "Per Night" for a track's huts.
  - `needs`: `park-pass` for a spot inside a national park that charges entry (then `free: true` unless the spot charges for something of its own, and never the pass's price), `booking` for a free spot booked ahead, `permit` where a permit is required (its fee, if any, is the price).
  - Parking is never the price: a place free to enter is `free: true` whatever its car park charges. Nor are transport to it, extras inside it, or child and concession prices. Record the source of the fee and what it covers in your notes.
- Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache; it marks captcha walls BLOCKED).
