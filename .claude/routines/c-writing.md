# Routine: Pipeline C — writing (Quill)

Run by the scheduled cloud routine "Intrepid writing". Rules: `WRITING.md`; photos `IMAGES.md`. Conventions: `PIPELINES.md`. Do not merge anything.

1. `npm ci --ignore-scripts`; take the next batch of 5 from `npx tsx scripts/curation-backlog.ts --batch 5`.
2. Triage: `npx tsx scripts/curation/lint-entries.ts --dest <id> … --json curation/<branch>/quill/triage.json`. Only the entries it flags (broken, blocked or mismatched ticketUrl; a paid spot with no link; a multi-sentence or marketing bio; a photo title that won't resolve; a destination with the wrong number of reasons/tips) — plus any the owner names — go to the agents. An entry that passes is left alone.
2b. Tier new spots: `npx tsx scripts/curation/tier-spots.ts --file <spots.json> --out tiers.json`. `simple` spots (a beach, lookout, roadside icon or monument with no sign of a fee, operator or park) get the default facts and ONE batch writer for up to 40 of them (`jobs/jobC-simple.md`), no researcher or fact-checker; everything else, and every 8th simple spot as an audit, takes the full chain. If an audited simple spot comes back with different facts, rerun the whole simple tier through the full chain.
3. Per destination with flagged entries (and every `timed` new spot), in `curation/<branch>/quill/<destination-id>/`: `spot-researcher` → `research.json` (flagged entries only); `copy-writer` → `drafts.json`; `fact-checker` → `facts.json`; `copy-editor` → `final.json`; `reconciler` applies `final.json`, runs the checks and commits that destination alone.
4. Every changed claim needs its source in the pull request body; anything `unverifiable` is cut or listed as unverified for the owner.
5. One pull request through the REST API assigned to `azhou38`, then the push notification.
