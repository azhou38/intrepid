# SA run: brief for every coverage-proposer

Repo root: /Users/alexzhou/Developer/mobile-wellington. Role: .claude/agents/coverage-proposer.md; job:
.claude/routines/jobs/jobA-place.md (read both first). Your region folder: curation/sa/region-<REGION>/. Region
boundaries: curation/sa/sa-regions.md.

Place only what verdicts.json keeps (`keep`). `review` entries are NOT placed: list them in placement.json under
`review` with name, reason and the judge's objection (they go to the owner in the final report).

South Australia has NO destinations in the app yet, so the destinations are yours to propose (COVERAGE.md "The two
levels", "Granularity", "A destination is a name travellers actually use", "Prefer the region travellers name over one
town in it", "A place people file under a bigger city is not its own destination"). The run adds every destination you
propose that passes the name test and the spot bar (at least four worthwhile spots, or a rank 1-2 headline place), so
propose carefully. For each proposed destination give `{ id, name, category, rank (be honest: few rank 1-2 in a state;
Adelaide, Kangaroo Island, the Barossa and the Flinders Ranges are the state's headline names), coordinates (the visitor
hub or town centre, from a source), coordinates_source, defaultZoomSpanKm (every one of its spots within about 75% of
it), spots: [ids in importance order, the headline first], name_evidence: { source, wording } }`.
Ids: a destination id is a new lowercase slug (check it is not already an id in src/data/destinations.ts or
src/data/spots.ts); its spots are `<destId>-<n>` from 1 in importance order; a standalone spot is its own unique slug.

Run-wide decisions (do not re-decide them):
- Long trails are placed ONCE, at the midpoint of the whole route, in the region named here: the Heysen Trail in
  sa-flinders if kept anywhere (its midpoint lies in the Mid North/Flinders), the Mawson Trail likewise; the Riesling
  Trail in sa-barossa-clare; the Kangaroo Island Wilderness Trail in sa-kangaroo-island; Walk the Yorke in sa-yorke; the
  Oodnadatta, Birdsville and Strzelecki Tracks in sa-outback. Other regions that kept them: list them under
  `duplicates_elsewhere`, do not place them.
- Judges' notes in each verdict's `reason` and `objection` carry naming and merging decisions (e.g. "keep as one spot
  named X", "duplicate of Y", "name it Z", "the town is a wrapper for its attraction"): apply them. Where two kept
  entries are one place, place one and list the other under `merged`.
- A town is a spot only when the town itself is a draw; never list a town beside its own headline attraction as a
  wrapper (keep the attraction; mention the town in the destination's description). A town that is a real base for a
  cluster of spots is a candidate destination, if travellers name it (otherwise the region they name: the Barossa, not
  Tanunda; the Fleurieu or McLaren Vale, not Willunga).
- Coordinates you are unsure of: leave null with `needs_research: ["coordinates"]` (every spot is re-pinned with
  resolve-pin.py in the next stage anyway). Never carry over a point that is a town's for an attraction.
- Copy: a bio states only sourced facts; a superlative only when a source states it as fact, never an opinion. No source
  names in copy. Spots carry no opening hours.

Outputs: placement.json and fairness.json in your region folder, as the job says. Final message: the fairness summary in
five lines, the proposed destinations (id, name, rank, spot count), the standalone count, and anything you merged or
could not place.

## Added after the verdict passes (read these too)

- **Inputs.** `curation/sa/region-<REGION>/skeptic.json` lists the kept places (name, verdict keep, the resolver's reason as `objection`); full details are in `candidates.json`
  (wiki, sources, note, coordinates) and `verdicts.json` (reason, resolver_source). `review` verdicts are NOT placed (list them under `review`).
- **Place, do not research.** Do not fetch pages or look up coordinates. Take coordinates only from the candidate; where it has none, or it looks wrong
  (a point in another country or state, a town's point for an attraction, a Wikipedia area point for a place that is a beach/walk), set `coordinates: null`
  and `needs_research: ["coordinates"]`. Every spot is re-pinned with resolve-pin.py in the next stage. Leave cost and ticketUrl null with `needs_research`.
- **One home per place.** `curation/sa/homes.json` names the region that places each place kept in two regions (Port Noarlunga, Para Wirra, Kuitpo Forest and
  Lake Gairdner NP, Milang, Lyndhurst, Mount Monster CP, the Heysen and Mawson Trails). If a place in `homes.json` is not this region's, list it under
  `duplicates_elsewhere` and do not place it here. Long trails (Heysen, Mawson, Lavender Federation, Riesling) are placed once at the midpoint of the whole
  route, in their home region; the proposer for that region decides the coordinates later (null here).
- **Merge notes from the judges.** Where a resolver reason says "duplicate of X", "merge with X", "the park is the spot, not the town", or that two kept entries
  are the same venue (PS Marion and Mannum Dock Museum; Hallett Cove Beach and Hallett Cove Conservation Park; Cape Willoughby Conservation Park and its
  lighthouse; Mount Boothby and Tolmer Rocks; Mid Murray Class Car Gallery and the Swan Reach museum), place one spot and list the other under `merged`.
  A town kept only because it holds one attraction is a wrapper: keep the attraction, mention the town in the destination's description.
- **Names.** Apply renames in the reason (Monash Playground -> Monash Adventure Park; the Catholic Catacomb Church candidate's wiki title is the Anglican
  church: check the reason). A spot's name is its own name, no qualifier. A Wikipedia title that is another place's (Pool of Siloam -> Jerusalem) gets `wiki: null`.
- **Destinations.** South Australia's likely destinations (confirm each against the name test and four-spot bar): Adelaide, the Adelaide Hills, the Barossa Valley,
  the Clare Valley, McLaren Vale (or the Fleurieu coast), Victor Harbor, Kangaroo Island (one destination with Flinders Chase NP, Seal Bay, Kingscote, Penneshaw
  as spots, or Flinders Chase NP as its own park destination if a rank-1/2 park pin is better; decide and say why), Mount Gambier, Robe, Naracoorte Caves NP,
  the Coorong, the Riverland (Renmark/Berri), Murray Bridge, the Yorke Peninsula (Copper Coast, Innes NP), Port Lincoln, Coffin Bay, Streaky Bay, Ceduna,
  Whyalla, the Flinders Ranges (Ikara-Flinders Ranges NP), Quorn, Arkaroola, Coober Pedy, Lake Eyre/Oodnadatta Track, Port Augusta. Prefer the region
  travellers name; a national park with at least four spots (or flagship status) is a destination.
