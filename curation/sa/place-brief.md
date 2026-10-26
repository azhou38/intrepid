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
