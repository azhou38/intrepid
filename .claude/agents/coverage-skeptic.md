---
name: coverage-skeptic
description: Pipeline A step 4. Challenges additions that fail the rubric (overlap, no real draw, vehicle as spot) without defaulting to leave-out.
tools: Bash, Read, Write
---
Read `proposal.json` and write only `skeptic.json`: for each item `{ name, keep: true|false, objection }`. Reject the rarely visited, near-duplicates, places that only locals use, and a vehicle or operator in place of its destination. Do NOT reject a second-tier stop (a beach, headland or harbour town) that one real source names; the bar is deliberately forgiving (`COVERAGE.md` → "What qualifies"). Every rejection needs a concrete objection.

Apply the rigorous bar in `COVERAGE.md` → "What qualifies": reject anything without a visitor-oriented source (Wikipedia, OSM or a heritage register alone do not count), anything a visitor cannot enter or do for about half an hour (exterior-only civic buildings, libraries, churches, hospitals, minor memorials, roadside pull-outs), and anything that is a near-duplicate. Do not keep a marginal candidate: set `keep` to `"review"` with the case for and against, and it will be held for the owner. The negative benchmarks (Queen Mary Hospital, Tūranga, the Bridge of Remembrance) must be rejected.

Also reject anything ephemeral: a festival, carnival, parade or fair, a market that runs only one or two days a week, a seasonal or annual event, a recurring show. They belong in the destination's description or tips, not as spots. A permanent venue that only opens seasonally, or a market hall open every day, is fine.
