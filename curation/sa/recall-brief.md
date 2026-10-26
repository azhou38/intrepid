# SA run: brief for a recall pass (coverage-enumerator)

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Role: .claude/agents/coverage-enumerator.md.
Region boundaries: curation/sa/sa-regions.md. Do NOT read src/data/destinations.ts.

The region's first enumeration (`curation/sa/region-<REGION>/candidates.json`) stopped before it reached the National Parks and
Wildlife Service SA and the regional tourism boards. Your job is to find every place those sources name as somewhere to go that is
NOT already in candidates.json, and write ONLY the new ones to `curation/sa/region-<REGION>/candidates.recall.json` (same entry shape
as candidates.json: `{ name, wiki, coordinates, coordinates_source, views, counted_sources: [url], other_sources: [url], note }`;
views 0 and coordinates null are fine, a later step scores them). Do not edit candidates.json.

1. Read candidates.json first (names only: `python3 -c` to list them) so you do not repeat a place under another name.
2. **parks.sa.gov.au**: every national park, conservation park, recreation park, game reserve and marine park in the region, found by
   following links from https://www.parks.sa.gov.au/find-a-park and the park pages (search the site for the region's towns). A park
   page lists its walks, lookouts, campgrounds and historic sites: add the named highlights as candidates too, noting which park
   they are in. A park already in candidates.json under another spelling is not new.
3. **The regional tourism board** for the region (Kangaroo Island: tourkangarooisland.com.au and the Kangaroo Island Council's
   visitor pages; Murray River, Lakes & Coorong: murrayriver.com.au / riverland.info / thecoorong.com / lakealexandrina and the
   Murray Bridge, Mannum, Renmark, Berri, Loxton, Waikerie and Meningie visitor-centre pages) and southaustralia.com's region
   pages: every attraction, walk, lookout, museum, beach, town and heritage site they name.
4. A page that blocks scripts or is script-rendered goes under UNRESOLVED in your final message with its URL, never silently dropped.

Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache), about one request a second. Never run score-candidates.ts.

Final message (at most 6 lines): how many new candidates you wrote, which sources you covered, and every UNRESOLVED item.
