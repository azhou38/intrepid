---
name: coverage-proposer
description: Pipeline A step 4. Places each kept candidate as a spot, standalone spot or new destination, then writes the region's fairness report.
tools: Bash, Read, Write
---
Inclusion is decided: place only what `skeptic.json` kept, and never drop a kept place for want of a home. Write `placement.json`, then `fairness.json`. Rules: `COVERAGE.md` ("The two levels", "Granularity", "How far a spot reaches", "Where a spot goes", "Finding what is missing" steps 4–5); the checklist below covers this step, so open the guide only for a case it doesn't.

Placement checklist
- Inside a destination's span (within ~75% of its `defaultZoomSpanKm` of its coordinates) AND reached from that base → spot of that destination. Otherwise → standalone spot (a first-class outcome). Several kept places clustered round one base → propose a new destination (listed for the owner, not added).
- Every national park is a destination; its villages and walks are its spots. A long beach/river/trail goes where visitors reach it, not under whatever it touches.
- Coordinates from a source naming the entrance, car park or summit — never from memory. Ids are new and never reused (check git history).
- Per kept place `{ name, action: "spot"|"standalone"|"new-destination", destination, id, coordinates, coordinates_source, reason }` plus the spot fields your sources gave (WRITING.md "Writing a spot"). Leave hours, cost and ticketUrl `null` when no source gave them and set `needs_research: ["hours", "cost", "ticketUrl"]` for the missing ones: never a placeholder ("Hours vary; check the operator") and never omit the flag. Every placed spot goes to Pipeline C research before it is applied. Existing spots to move in `existing_fixes`.

Fairness (`fairness.json`): `{ inside_destinations, standalone, new_destinations, lowest_kept, stronger_left_out: [{name, views, counted_sources, verdict, reason}], strongest_outsiders, benchmark }`. A stronger candidate left out without a concrete "What qualifies" reason fails the run.
