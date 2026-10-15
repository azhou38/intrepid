# Routine: Pipeline C — writing

Run by the scheduled cloud routine "Intrepid writing". Rules: `WRITING.md`; photos `IMAGES.md`. Conventions: `PIPELINES.md`. Do not merge anything.

1. `npm ci --ignore-scripts`; take the next batch of 5 from `npx tsx scripts/curation-backlog.ts --batch 5`.
2. Per destination, in `curation/<branch>/<destination-id>/`: `spot-researcher` → `research.json`; `copy-writer` → `drafts.json`; `fact-checker` → `facts.json`; `copy-editor` → `final.json`; `reconciler` applies `final.json` to `src/data`, couples the three reasons to their photos, runs the checks and commits that destination alone.
3. Every changed claim needs its source in the pull request body; anything `unverifiable` is cut or listed as unverified for the owner.
4. One pull request through the REST API assigned to `azhou38`, then the push notification.
