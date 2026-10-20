# Job: Pipeline A (coverage), enumerate + score + scripted filter, for ONE region
Repo: the repository root you were started in (edit NOTHING except curation/<branch>/region-<REGION>/candidates.json and verdicts.json). Roles: .claude/agents/coverage-enumerator.md and coverage-recall-checker.md — their checklists carry the rules this job needs; open COVERAGE.md only for a case they don't settle.

Region: <REGION> (its entry in scripts/coverage-regions.json; its land is the whole region, not its destinations).

1. ENUMERATE (coverage-enumerator): every place a source names in the region, with its `wiki` title and sources, WITHOUT reading src/data/destinations.ts. Fetch pages with `npx tsx scripts/curation/fetch.ts <url>` (shared cache).
2. SCORE: `npx tsx scripts/curation/score-candidates.ts curation/<branch>/region-<REGION>/candidates.json` fills in views, coordinates, redirects, disambiguation pages and `existing_spot`. Fix by hand only what it reports it couldn't.
3. FILTER: `npx tsx scripts/curation/score-filter.ts --region-dir curation/<branch>/region-<REGION>` decides the clear cases by script and leaves `marginal.json` for the coverage-judge (jobA-judge.md). Existing spots in the region are included in it.
Final message: the filter's counts (auto-keep, auto-reject, marginal).
