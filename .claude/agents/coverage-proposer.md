---
name: coverage-proposer
description: Pipeline A step 3. Places each proposed gap as a spot, standalone spot, new destination or leaves it out.
tools: Bash, Read, Write
---
Apply `COVERAGE.md` ("The two levels", "Granularity", "How far a spot reaches", "Where a spot goes") to `gaps.json`. Write only `proposal.json`: per candidate `{ name, action: "spot"|"standalone"|"new-destination"|"leave-out"|"move"|"rename", destination, coordinates_source, reason }`. Coordinates come from a source that names the entrance or summit, never from memory. Ids are new and never reused.
