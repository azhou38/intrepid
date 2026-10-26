# SA run: brief for every coverage-enumerator

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Your role is
.claude/agents/coverage-enumerator.md and the job is .claude/routines/jobs/jobA-region.md (read both first; branch
folder = `curation/sa`). Your region and its boundaries: curation/sa/sa-regions.md. Output:
`curation/sa/region-<REGION>/candidates.json`, then run steps 2 (score) and 3 (filter) of the job yourself.

South Australia has NO destinations or spots in the app yet, so every place is new. Enumerate the WHOLE region from
sources, not memory. Work through ALL of these, in this order, and keep going until each is exhausted:

1. **Towns.** Every town and village in the region that a visitor source gives a section, page or listing: list the town
   itself as a candidate (note: "town"), then its See/Do listings.
2. **Wikivoyage.** The region's page(s) and EVERY town/park page under them: every See and Do listing
   (https://en.wikivoyage.org/wiki/South_Australia and its region pages; use `?action=raw` for the wikitext).
3. **South Australian Tourism Commission.** https://southaustralia.com/destinations/<region> and its "things to do",
   attraction and town pages (loads for scripts).
4. **National Parks and Wildlife Service SA.** Every park, conservation park, reserve, recreation park, marine park
   visitor site and walk in the region on https://www.parks.sa.gov.au (park pages list their walks, lookouts and
   campgrounds: list the named highlights as candidates too, noting which park they are in).
5. **The regional tourism board** for your region (e.g. barossa.com, clarevalley.com.au, fleurieupeninsula.com.au,
   tourkangarooisland.com.au, riverland.info / murrayriver.com.au, thelimestonecoast.com, yorkepeninsula.com.au,
   eyrepeninsula.com, flindersranges.com / flindersandoutback.com.au, adelaidehills.org.au; find the right one by
   search) and the council visitor-centre sites.
6. **Wikipedia** categories for the region: tourist attractions, museums, beaches, lookouts, walks/trails, caves,
   islands, lakes, heritage sites, wineries a guide names, Big Things of Australia in SA.
7. **Long trails** that pass through: the Heysen Trail, the Mawson Trail, the Riesling Trail, the Kangaroo Island
   Wilderness Trail, Walk the Yorke, the Oodnadatta Track, etc.: list them; the proposer decides where each is placed.

Recall check before you finish: read your list against the region's tourism board "top things to do" and the
Wikivoyage region page once more, and add anything missed. Second-tier stops count (a beach, jetty, lookout, small
museum, quirky Big Thing that a guide names); include operators, markets and events too, with a `note` saying what
they are (the next steps judge them).

Coordinates: give them only from a source about that place itself (its Wikipedia article, its NPWS page's map, an OSM
feature named for it); otherwise leave `coordinates: null` (score-candidates.ts fills Wikipedia's). Never a town's
point for an attraction, never a guess.

Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache), about one request a second; back off on 429. A
page that blocks scripts goes in `_unresolved` in your final message with its URL. Never read src/data/destinations.ts.

Final message (at most 8 lines): candidates written, the filter's counts (auto-keep, auto-reject, marginal), and every
unresolved source.
