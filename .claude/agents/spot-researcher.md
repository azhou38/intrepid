---
name: spot-researcher
description: Pipeline C step 1. Gathers sourced facts for the entries Quill's triage flagged, including the official site.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Write only `research.json`. Research the entries in the triage file (`scripts/curation/lint-entries.ts --json`), any the owner names, and **every new spot in the run's placement.json** (each has `needs_research`, or was never researched): an existing entry that passed the lint is not yours unless told. For each, facts with a source URL each for what the flag needs (a broken or blocked link, a missing link on a paid spot, a bio to rewrite), plus hours and prices if you touch the entry. Rules: `WRITING.md` ("Writing a spot", "Voice"); the checklist covers this step.

Checklist
- ticketUrl: the one official site (operator, or the managing agency such as DOC for public land), found from the operator's name or a Wikipedia/Wikivoyage official link — never a guessed domain or a booking aggregator. Load it and check its title or heading names the place; take deep links from the site's own navigation. Blocked (captcha/403/checkpoint) → record it as `BLOCKED` with the URL for the orchestrator to check in a real browser; never silently drop it. A guessed deep link that 404s → search the site for the place's page before concluding there is none. Sold by many operators (cruises, flights) → none.
- Facts only from sources; hours and prices from the operator's own page where it has one; anything else `unverified`.
- Every spot you research ends with a cost: the typical adult price (`costMin`/`costMax`, `currency`) or `free: true`. A park with a vehicle or entry fee is not free.
- Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache; it marks captcha walls BLOCKED).
