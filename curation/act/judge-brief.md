# ACT run: brief for every coverage-judge shard

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Your role is
.claude/agents/coverage-judge.md and the job is .claude/routines/jobs/jobA-judge.md (read both first), with these
differences for this run:

- The region's marginal band is split into shards. Judge ONLY your shard file,
  `curation/act/region-act-canberra/marginal.part-<N>.json`, and write
  `curation/act/region-act-canberra/judged.part-<N>.json` (a list, one entry per shard entry:
  `{ name, verdict: "keep"|"reject"|"review", reason, objection }`). Silence is not allowed: every entry gets a verdict.
- Only shard 1 also re-decides the audit sample: read `audit.json` and write `audited.json` exactly as the job says
  (`{ name, verdict, reason }`, decided fresh, without looking at `script_verdict`). Other shards do not touch audit files.
- The region is the Australian Capital Territory, the whole territory. Each entry carries its full candidate (`candidate`:
  wiki, sources, note, coordinates). A place that lies in NSW gets `reject` with the reason "outside the region: NSW".
  Never read src/data/destinations.ts or src/data/spots.ts (blind to placement).
- Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache), about one request a second. parks.act.gov.au (the
  ACT parks agency) blocks scripts; its pages were read in a browser and the recreation-area names with the agency's
  descriptions are in `curation/act/sources/parks-act-leads.json`: treat it as a counted source (the managing agency's
  visitor pages) for a place listed there, and note in the reason that you relied on it.
- Entries with `rule: "run-override"` were auto-decided wrongly by the script (the `reason` says why): judge them fresh.
- Rules that apply to this run (COVERAGE.md "What qualifies"; decisions made once so shards agree):
  - A church, chapel or cathedral is never kept for being a church, nor rejected for it: keep it only when a visitor
    source names something to see or do there (an interior visitors go in for, notable art or architecture, a tour, a
    landmark a guide singles out); a local parish church seen from the street is rejected.
  - Operators, tours, cruises, scenic flights, shops, restaurants, cafés, bars, accommodation, campgrounds, caravan parks,
    cinemas, casinos, bowling alleys, mini-golf, escape rooms, golf and other clubs are rejected (a spot is a place, not a
    business or the way you get there). A winery, brewery or distillery is a place to go only when a visitor source singles
    it out as a destination in its own right (a landmark estate a guide names, not one of dozens of cellar doors);
    otherwise reject with that reason.
  - Events, festivals, annual shows and seasonal or weekly markets are rejected (a market on one or two days a week is not
    a place that is there whenever you arrive). A permanent venue that holds them (a showground, a park) is judged on its
    own.
  - Canberra's national institutions (the Parliament House, High Court, National Gallery, Museum, Library, Archives,
    Portrait Gallery, Film and Sound Archive, Questacon, Royal Australian Mint, War Memorial, Botanic Gardens, Arboretum,
    Deep Space Communication Complex and so on) are places visitors go in: keep when a visitor source names them, whatever
    their page views.
  - The memorials along Anzac Parade and around Lake Burley Griffin: Anzac Parade is judged as the one avenue visitors walk
    (keep or review); each memorial on it is rejected as "part of Anzac Parade / a minor memorial" unless a visitor source
    singles it out as a visit in its own right (the Aboriginal Tent Embassy, say, has its own history). A themed garden,
    section or feature inside a larger candidate (the Botanic Gardens' themed gardens, a trail inside a nature reserve that
    is already a candidate, a lookout on a mountain track the list already has) is rejected as "part of <larger>" or kept as
    one: say which in the reason, and if you keep it, keep the larger and reject the part.
  - Embassies and high commissions, ministers' residences, government offices, courts and civic buildings seen only from the
    street, sports stadiums and ovals (unless a visitor source names a tour or museum there), cinemas and theatres as
    buildings, suburbs and town centres with nothing a source names to see, and local playgrounds, sports grounds and
    urban parks no guide singles out are rejected. A park or reserve a visitor source names (a nature reserve with a named
    walk or lookout, a district park a guide recommends) is kept.
  - A hill, peak or lookout is kept when a visitor source names it as somewhere to go (Mount Ainslie, Black Mountain, Red
    Hill, Mount Taylor, One Tree Hill and the like), as a separate place from a walking track the list also has: say if one
    contains the other.
  - Long walking tracks that cross the border (the Australian Alps Walking Track, the Bicentennial National Trail) are
    `review`, noting how much of the route lies in the ACT.
  - Historic huts, homesteads and old tracking-station sites: keep when a visitor source names them as a visit with
    something to see; a ruin or a site with nothing left to see is review or reject with that reason.
  - Towns and villages: Hall and Tharwa are kept when a visitor source gives them their own listing or section; a town
    with nothing named to see is reject.
  - Duplicates (two names for one place, a feature inside a larger candidate): reject the lesser with "duplicate of
    <name>" or keep as one and say which. The Museum of Australian Democracy and Old Parliament House are one place:
    keep as "Old Parliament House" and reject the other as its duplicate. The Big Powerful Owl and Owl (Armstrong) are one
    sculpture; so are Hall Park and any Hall listing that says the same.
  - Unsafe or closed places, and anything a source says is closed (for demolition, restoration), are rejected.
- Wikipedia titles the run corrected by hand are in `wiki`; a `wiki_note` explains a title that was cleared. Do not use
  `views` to reject a place a visitor source names for an obvious draw.

Final message: your shard's counts (keep / reject / review), the review list by name with a line each, and for shard 1
the audit disagreements by name.

## Full-path rerun (the audit overturned 3 of 10 script decisions)
Two more shards, `marginal.rerun-1.json` and `marginal.rerun-2.json` (judged to `judged.rerun-1.json` and
`judged.rerun-2.json`), hold the candidates the script had decided by itself (51 keeps, 13 rejects), now judged by you
under the same rules. Their `reason` records what the script said and why; do not defer to it. The run's decisions above
stand (national institutions kept, wineries rejected unless singled out, events and weekly markets rejected, the
Parliamentary Triangle is judged as the precinct only if no institution inside it is already a candidate: otherwise
review it as overlapping). A retail gallery or shop is rejected even when a guide lists it.
