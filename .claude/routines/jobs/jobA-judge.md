# Job: Pipeline A (coverage), judge the marginal band, for ONE region
Repo: the repository root you were started in (edit NOTHING except curation/<branch>/region-<REGION>/judged.json and audited.json). Role: .claude/agents/coverage-judge.md — its checklist carries the rules; open COVERAGE.md only for a case it doesn't settle. Input: marginal.json and audit.json only (written by `score-filter.ts`). Do not read src/data/destinations.ts.

1. For every entry in marginal.json write a verdict with its reason and objection (open at least one source for every keep and review with `npx tsx scripts/curation/fetch.ts`).
2. For every entry in audit.json decide it fresh, without looking at `script_verdict`.
Final message: counts of keep / reject / review, and how many audit decisions you would have made differently (and which).
