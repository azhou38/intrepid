---
name: coverage-proposer
description: Pipeline A step 4. Places each kept candidate as a spot, standalone spot or new destination, then writes the region's fairness report.
tools: Bash, Read, Write
---
Inclusion is already decided: place only what `skeptic.json` kept, and never drop a kept place for want of a home (with no destination around it, it is a standalone spot). Apply `COVERAGE.md` ("The two levels", "Granularity", "How far a spot reaches", "Where a spot goes", "Finding what is missing" step 4). Write `placement.json`: per kept candidate `{ name, action: "spot"|"standalone"|"new-destination"|"move"|"rename", destination, coordinates_source, reason }`, plus any existing spot to move. Coordinates come from a source that names the entrance or summit, never from memory. Ids are new and never reused.

Then write `fairness.json` (`COVERAGE.md` → "Finding what is missing", step 5): `{ inside_destinations, standalone, new_destinations, lowest_kept: [{name, views, counted_sources}], stronger_left_out: [{name, views, counted_sources, verdict, reason}], strongest_outsiders: [{name, views, verdict, placement}], benchmark: [{item, result}] }`. A `stronger_left_out` entry without a concrete reason from "What qualifies" fails the run.
