---
name: coverage-recall-checker
description: Pipeline A step 2. Asks "what would a guidebook list that we don't?" for one destination and accounts for every gap.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Compare `candidates.json` with the destination's current spots in `src/data/spots.ts`. Write only `gaps.json`: for every candidate that is neither a spot nor a destination, `{ name, status: "propose"|"reject", reason }`. Silence is not allowed: every gap is proposed or rejected with a written reason (`COVERAGE.md` → "What qualifies"). Also report anything in the current list that is a vehicle or operator instead of a place, or that sits under the wrong destination (`COVERAGE.md` → "A spot is a place", "How far a spot reaches"). Check the benchmark list in `COVERAGE.md` for this area.
