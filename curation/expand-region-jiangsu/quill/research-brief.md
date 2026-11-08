# Research brief (Jiangsu, China) — Pipeline C step 1 for one shard

You are the spot-researcher (.claude/agents/spot-researcher.md; rules WRITING.md "Writing a spot", "What the cost is for", "ticketUrl"). Repo root: /Users/alexzhou/Developer/mobile/.claude/worktrees/elastic-visvesvaraya-b59401 (absolute paths). Run dir: curation/expand-region-jiangsu.

Input: quill/shards/<SHARD>.json (list of placed spots: id, name, wiki, category, bio_draft, cost, source_region ...), and per-spot evidence bundles evidence/<id>.json (start there). Pins are DONE (pins/pins-merged.json): do not research coordinates.
Output: quill/<SHARD>/research.json = { "<id>": { "facts": [ {text, source_url} ], "bio_sources": [...], "free": bool, "costMin", "costMax", "currency": "CNY", "costBasis", "costPer"?, "needs"?, "cost_source": url, "cost_confidence": "official|guide|none", "ticketUrl": url|null, "ticketUrl_status": "verified|BLOCKED|none-sold-by-many|no-official-site|unverified", "ticketUrl_evidence": "...", "visitHoursMin", "visitHoursMax", "wiki": "<exact en Wikipedia title or null>", "notes": "..." } }.

China-specific rules:
- Currency CNY. Prices only from the operator's/government page, Wikivoyage listing (adult ticket) or a named guide; mark cost_confidence honestly. NEVER invent a price. If no source gives a price and entry is clearly free (open park/street/memorial hall with free admission per a source) write free:true with the source; otherwise leave cost null and cost_confidence 'none' (the spot will be held for cost).
- ticketUrl: only an official operator/government site you loaded and verified names the place (title/heading). Chinese official sites may block scripts: record BLOCKED with the URL (the orchestrator checks it in the in-app browser). Never a booking aggregator (Ctrip/Trip.com/Klook/Meituan), never a guessed domain. Many Chinese places have no English official site: ticketUrl null with status 'no-official-site' is fine; a Chinese-language official page is acceptable if verified.
- Record no opening hours. Record visitHoursMin/Max (0.25 steps).
- `wiki` = exact English Wikipedia article title only if the article exists and is this place.
- Facts only from sources; Chinese-language sources fine (Chinese Wikipedia, Baidu Baike, official). Use scripts/curation/fetch.ts <url> for fetches (cached). Back off on 429; a blocked/rate-limited source is UNRESOLVED, retried, never evidence against a place.
- bio facts: 2-4 sourced facts per spot that a one-sentence bio (<=120 chars, 10+ words) can use: what it is, where, the one thing worth a stop.
Final message max 8 lines: path, counts (verified links / BLOCKED / no link; priced / free / no cost), unresolved ids.
