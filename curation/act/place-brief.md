# ACT run: brief for the coverage-proposer

Repo root: /Users/alexzhou/Developer/mobile-wellington. Role: .claude/agents/coverage-proposer.md; job:
.claude/routines/jobs/jobA-place.md (read both first). Your region folder: curation/act/region-act-canberra/ (write
placement.json and fairness.json there). Region: `act-canberra`, the whole Australian Capital Territory.

Place only what verdicts.json keeps (`keep`). `review` entries are NOT placed: list them in placement.json under `review`
with name, reason and the judge's objection (the owner decides them; an approved one is placed later). `reject`s are not
placed.

The ACT has NO destinations in the app yet, so the destinations are yours to propose (COVERAGE.md "The two levels",
"Granularity", "A destination is a name travellers actually use", "Prefer the region travellers name over one town in it",
"No overlapping destinations", "How far a spot reaches"). Two to four destinations is likely (the national capital; a
national park or reserve that clears the spot bar; maybe the Murrumbidgee / Cotter corridor if a visitor source uses it as a
name), but let the evidence decide: a base needs at least four worthwhile spots around it or flagship status, and a name
travellers use. For each proposed destination give `{ id, name, category, rank (be honest: few rank 1-2), coordinates
(the visitor hub or town centre, from a source), coordinates_source, defaultZoomSpanKm (every one of its spots within about
75% of it), spots: [ids in importance order, the headline first], name_evidence: { source, wording } }`. Country fields for
every entry: country Australia, countryCode AU, continent Oceania, timezone Australia/Sydney (the ACT observes Sydney
time). Ids: a destination id is a new lowercase slug (check it is not already an id in src/data/destinations.ts or
src/data/spots.ts); its spots are `<destId>-<n>` from 1 in importance order; a standalone spot is its own unique slug.

Run-wide decisions (do not re-decide them):
- The judges kept some places twice under two names. Place each ONCE (merge, and list the other under `merged`):
  Owl (Armstrong) + The Big Powerful Owl (one sculpture; name "The Big Powerful Owl", wiki "Owl (Armstrong)");
  Kingston Powerhouse + Canberra Glassworks (one place: name "Canberra Glassworks", the glass studio at the Kingston
  Powerhouse); Mount Ainslie + Mount Ainslie Lookout (one: "Mount Ainslie", the lookout is its draw); Black Mountain +
  Black Mountain Nature Reserve (one: "Black Mountain"; Telstra Tower was rejected as closed until December 2027, do not add
  it back); Red Hill Nature Reserve + Red Hill Lookout (one: "Red Hill"); Tharwa + Tharwa Village (one: "Tharwa");
  Canberra Centenary Trail + Centenary Trail (one: "Canberra Centenary Trail", pinned at the midpoint of the whole loop);
  Old Parliament House (the Museum of Australian Democracy is rejected as its duplicate).
- Mount Stromlo Observatory and Stromlo Forest Park are separate places. Queen Elizabeth II Island is kept for the National
  Carillon on it: if the National Carillon is also kept, place it once as "National Carillon" (the island's draw).
- The national institutions (Parliament House, Old Parliament House, the High Court, the National Gallery, Museum, Library,
  Archives, Portrait Gallery, Film and Sound Archive, Questacon, the Royal Australian Mint, the Australian War Memorial,
  the National Capital Exhibition, the Botanic Gardens, the Arboretum, the Zoo) belong with Canberra if it is a destination.
- A long trail is placed ONCE at the midpoint of its whole route; the Canberra Centenary Trail is the one kept here.
- Lake Burley Griffin is placed as the lake (its shores' sights are separate spots).
- The enumerators' coordinates are unreliable (many came from a Wikipedia article for a larger place or an area). Carry
  them over only as hints; every spot's real pin is resolved at the next stage with resolve-pin.py. Where a candidate has no
  coordinates leave `coordinates` null and set `needs_research: ["coordinates"]`.
- A town or village is a spot only when it is a draw itself (Hall, Tharwa: kept by the judges); Hall's wineries were
  rejected. Never list a town beside its own headline attraction as a wrapper.
- Copy: a bio states only sourced facts; a superlative only when a source states it as fact ("the world's oldest ..."),
  never an opinion ("most beautiful"). No source names in copy.
- Cost fields (WRITING.md "What the cost is for"): leave `cost`, `costBasis`, `costPer` and `needs` for research; ACT's
  national parks and reserves have no entry fee, so a nature reserve is not a "park pass needed" spot. Parking is never
  a price.

Outputs: placement.json and fairness.json in your region folder, as the job says. Final message: the fairness summary in
five lines, the proposed destinations (id, name, rank, spot count), the standalone count, and anything you merged or could
not place.
