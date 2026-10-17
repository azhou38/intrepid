# Job: Pipeline A (coverage), enumerate + score + blind verdicts, for ONE region
Repo: the repository root you were started in (edit NOTHING except curation/<branch>/region-<REGION>/candidates.json and verdicts.json). Roles: .claude/agents/coverage-enumerator.md and coverage-recall-checker.md — their checklists carry the rules this job needs; open COVERAGE.md only for a case they don't settle.

Region: <REGION> (its entry in scripts/coverage-regions.json; its land is the whole region, not its destinations).

1. ENUMERATE (coverage-enumerator): every place a source names in the region, with its `wiki` title and sources, WITHOUT reading src/data/destinations.ts. Fetch pages with `npx tsx scripts/curation/fetch.ts <url>` (shared cache).
2. SCORE: `npx tsx scripts/curation/score-candidates.ts curation/<branch>/region-<REGION>/candidates.json` fills in views, coordinates, redirects, disambiguation pages and `existing_spot`. Fix by hand only what it reports it couldn't.
3. VERDICTS (coverage-recall-checker), blind to placement: every candidate without `existing_spot`, and every existing spot whose coordinates fall in the region, gets keep / reject / review with a reason from "What qualifies". Write verdicts.json: [{"name","existing","spot_id","verdict","reason","views","counted_sources"}].
Final message: counts of keep / reject / review, new vs existing.
