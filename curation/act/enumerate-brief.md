# ACT run: brief for every coverage-enumerator

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Your role is
.claude/agents/coverage-enumerator.md and the job is .claude/routines/jobs/jobA-region.md (read both first), with these
differences for this run:

- The region is the Australian Capital Territory: `act-canberra` in scripts/coverage-regions.json ("Canberra & ACT"),
  the whole territory: Canberra's districts (the City, Inner North and Inner South, Belconnen, Gungahlin, Woden Valley,
  Weston Creek, Tuggeranong), the lake, the rural west and south (Tidbinbilla, Namadgi, the Cotter, the Murrumbidgee
  corridor, Hall, Tharwa) and everything between. Its land is NOT limited to the city.
- There are no ACT destinations or spots in the app yet. Do not read src/data/destinations.ts or src/data/spots.ts.
- Places across the border are not this region's: Queanbeyan, Googong, Bungendore, Yass, Murrumbateman, Captains Flat,
  Michelago, Lake George, Tallaganda, Jervis Bay (a separate territory). Do NOT put them in candidates; list each in
  `curation/act/region-act-canberra/outside-act.<your slice>.json` as `[{ name, why }]`, so the run can check the NSW
  regions cover them.
- You write ONLY your slice's file (below), as `[{ name, wiki, coordinates, coordinates_source, views,
  counted_sources: [url], other_sources: [url], note }]`, the shape the role describes. Do NOT run score-candidates.ts
  (the run merges the slices and scores once). `wiki` is the exact English Wikipedia title when the place has an
  article, else null. Coordinates may be null where no source gives them; never from memory.
- List every place at least one source names as somewhere to go, whatever it is (an operator, an event, an embassy, a
  suburb go in with a `note` saying what they are); the next steps judge them. Silence is not allowed: a place a
  source names is listed. Prefer recall.
- Sources to work through, each page read with `npx tsx scripts/curation/fetch.ts <url>` (shared cache; about one
  request a second): Wikivoyage's Canberra and every district page under it, plus the pages for Namadgi National Park
  and Tidbinbilla Nature Reserve if they exist; visitcanberra.com.au (the regional tourism board: things to do,
  attractions, nature, museums, history, family); the ACT Parks and Conservation Service and Environment ACT visitor
  pages (parks, reserves, lookouts, walks, picnic areas, Cotter, Googong excluded: NSW); Wikipedia's categories for
  tourist attractions, museums, galleries, parks, nature reserves, lookouts, lakes, walking tracks, heritage sites and
  observatories in Canberra / the ACT; OpenStreetMap attractions and viewpoints with a Wikipedia link in the ACT.
  Lonely Planet, Rough Guide or Tripadvisor-style guides count as guidebooks where they load; a site that blocks
  scripts (BLOCKED) is listed in your final message by URL, never silently dropped.
- Counted sources are visitor-oriented ones only (Wikivoyage listings, the tourism board, the ACT parks agency, a
  guidebook); Wikipedia, OSM, Commons and heritage registers go in `other_sources`.

Final message: your slice's candidate count, how many have no coordinates, the BLOCKED urls, the outside-act list by
name, and any places you think a source names that you could not reach.
