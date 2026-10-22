# WA run: brief for every coverage-proposer

Repo root: /Users/alexzhou/Developer/mobile-wellington. Role: .claude/agents/coverage-proposer.md; job:
.claude/routines/jobs/jobA-place.md (read both first). Your region folder: curation/wa/region-<REGION>/. Region
boundaries: curation/wa/wa-regions.md.

Place only what verdicts.json keeps (`keep`). `review` entries are NOT placed now: list them in placement.json under
`review` with name, reason and the judge's objection (the owner decides them; an approved one is placed later).

Western Australia has NO destinations in the app yet, so the destinations are yours to propose (COVERAGE.md "The two
levels", "Granularity", "A destination is a name travellers actually use", "Prefer the region travellers name over one
town in it"). For each proposed destination give `{ id, name, category, rank (be honest: few rank 1-2), coordinates
(the visitor hub or town centre, from a source), coordinates_source, defaultZoomSpanKm (every one of its spots within
about 75% of it), spots: [ids in importance order, the headline first], name_evidence: { source, wording } }`.
Ids: a destination id is a new lowercase slug (check it is not already an id in src/data/destinations.ts or
src/data/spots.ts); its spots are `<destId>-<n>` from 1 in importance order; a standalone spot is its own unique slug.

Run-wide decisions (do not re-decide them):
- Long trails are placed ONCE, in the region named here, at the midpoint of the whole route: the Bibbulmun Track and
  the Munda Biddi Trail in wa-south-west; the Cape to Cape Track in wa-south-west; the Canning Stock Route in
  wa-golden-outback (if kept there). Other regions that kept them: list them under `duplicates_elsewhere`, do not
  place them.
- Six places were moved between regions at reconciliation (they are in your verdicts if they are yours): Fernhook
  Falls, Mandalay Beach, Mount Frankland NP, Peppermint Grove Beach (wa-south-west); Sunset Beach, Geraldton
  (wa-coral-coast); Yongergnow Australian Malleefowl Centre (wa-great-southern, use that spelling); the Dalgaranga
  crater and Yalgoo go to wa-golden-outback if kept.
- Judges' notes in each verdict's `reason` and `objection` carry naming and merging decisions (e.g. "keep as one spot
  named X", "duplicate of Y", "name it Z", "the town is a wrapper for its attraction"): apply them. Where two kept
  entries are one place, place one and list the other under `merged`.
- A town is a spot only when the town itself is a draw; never list a town beside its own headline attraction as a
  wrapper (keep the attraction; mention the town in the destination's description). A town that is a real base for
  a cluster of spots is a candidate destination.
- Wrong enumerator coordinates are known for: London Bridge (Sandstone), Museum of the Great Southern, Smiths Beach,
  South Beach (Fremantle), Cathedral Rocks (Rottnest), Museum of the Goldfields, Esperance Bird and Animal Park,
  Hannans North Tourist Mine, Nanny Goat Hill. Never carry those points over: leave coordinates null and
  `needs_research: ["coordinates"]` (pins are resolved in the next stage with resolve-pin.py for every spot anyway).
- Copy: a bio states only sourced facts; a superlative only when a source states it as fact ("the world's largest
  fringing reef"), never an opinion ("most beautiful"). No source names in copy.

Outputs: placement.json and fairness.json in your region folder, as the job says. Final message: the fairness summary
in five lines, the proposed destinations (id, name, rank, spot count), the standalone count, and anything you merged
or could not place.
