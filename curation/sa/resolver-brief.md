# SA run: brief for every review-resolver shard (coverage-judge)

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Role: .claude/agents/coverage-judge.md. Rules:
COVERAGE.md "What qualifies" and curation/sa/judge-brief.md (read both).

The first judging pass put many places in `review`, and rejected some for want of a source it could not load. Most of those were
undecided only because the judge never found a counted source (it guessed URLs, or read two Wikivoyage pages). Your job is to
SETTLE each entry in your shard: `curation/sa/region-<REGION>/resolve-in.part-<N>.json` (entries `{ name, was, reason, candidate }`;
`was` is review or reject, `reason` is the first judge's note, `candidate` carries wiki, sources and notes).

For each entry:
1. Find evidence. Search for it (web search, with the place and "South Australia"), then open the managing agency's page
   (parks.sa.gov.au for a park), southaustralia.com, the region's tourism board, the council's visitor page, and Wikivoyage's page
   for the town or region. Do not guess URLs: follow links from index pages or search results. A counted source is a visitor-oriented
   page that names the place as somewhere to go (Wikivoyage See/Do, an agency visitor page, a tourism board, a guidebook).
   Wikipedia, OSM, a Commons category or a heritage register alone do not count.
2. Decide on "What qualifies" alone (blind to placement, destinations and how many spots the region has):
   - `keep`: a counted source names it AND a visitor can do or see something there for about half an hour or more AND it is a
     distinct, permanent place (not an event, festival, weekly market, operator, tour, vehicle, shop, café, accommodation or
     cellar door; not private or closed land). A second-tier stop that a guide names (a beach, headland, jetty, lookout, small
     museum, walk, conservation park with a named walk or lookout) is a keep: the bar is forgiving for places a guide names.
   - `reject`: a concrete "What qualifies" reason (closed, no public access, not a place, duplicate of <name>, an event, a business,
     outside the region: belongs to <region id>, no counted source found after searching). Say what you searched.
   - `review`: ONLY when sources genuinely conflict or a reasonable reviewer would argue either way after you have read the
     sources. Give the case for and against in `reason`. Do not use review because you ran out of time or sources.
3. Record `source`: the URL of the counted source you opened (for keep) or the page that decided a reject.

Write `curation/sa/region-<REGION>/resolved.part-<N>.json`: a list with one entry per shard entry, in the same order:
`{ name, verdict: keep|reject|review, reason, source }`. Silence is not allowed. Fetch with `npx tsx scripts/curation/fetch.ts <url>`
(shared cache) about one request a second; WebSearch is fine. A page that blocks scripts: say so in `reason`; blocked is not
evidence against a place. Never read src/data/destinations.ts.

Final message (at most 6 lines): keep / reject / review counts, and the review list by name.
