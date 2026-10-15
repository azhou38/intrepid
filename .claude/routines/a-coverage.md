# Routine: Pipeline A — coverage

Run by the scheduled cloud routine "Intrepid coverage". Rules: `COVERAGE.md`. Conventions: `PIPELINES.md`. Do not merge anything.

1. `npm ci --ignore-scripts`; take the next batch of 5 from `npx tsx scripts/curation-backlog.ts --batch 5` (or the countries/destinations the routine's prompt names).
2. Per destination, in `curation/<branch>/<destination-id>/`: `coverage-enumerator` → `candidates.json`; `coverage-recall-checker` → `gaps.json`; `coverage-proposer` → `proposal.json`; `coverage-skeptic` → `skeptic.json`.
3. Apply only the items the skeptic kept, per `WRITING.md` (ids never reused, standalone fields, names, coordinates from a source). New spots need a photo and an official site: run the imagery and research steps for them (`image-searcher` + `image-judge`, `spot-researcher`). Run `npx tsc --noEmit`, `npx tsx scripts/audit-spot-coordinates.ts --dest <id>`, `npx tsx scripts/check-destination-headers.ts`, `npx tsx scripts/photo-prefilter.ts`, `npx tsx scripts/build-image-manifest.ts`. One commit per destination.
4. Check the benchmark in `COVERAGE.md` → "Finding what is missing" for any NZ area in the batch; a run that misses it fails and opens no pull request.
5. One pull request through the REST API assigned to `azhou38`, body = the evidence table (candidate, source, decision, reason) and what could not be verified. Then the push notification.
