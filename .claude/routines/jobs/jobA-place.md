# Job: Pipeline A (coverage), placement + full entries + fairness report, for ONE region
Repo: the repository root you were started in (edit NOTHING except curation/<branch>/region-<REGION>/placement.json and fairness.json). Role: .claude/agents/coverage-proposer.md — its checklist carries the placement rules; open COVERAGE.md / WRITING.md only for a case it doesn't settle. Input: skeptic.json (the merged keeps and reviews), verdicts.json, candidates.json, src/data/destinations.ts (now you may read it), src/data/spots.ts, scripts/coverage-regions.json.

1. PLACE every candidate kept (spot / standalone / proposed new destination); never drop a kept place for want of a home. Flag existing spots under the wrong destination.
2. Full entries for new spots (WRITING.md "Writing a spot"): name, wiki, icon, coordinates with source, category, one-sentence bio from sourced facts, hours, visit hours, cost, `category`, ticketUrl — each from a source, or `null` with `needs_research` listing it (never a placeholder such as "Hours vary; check the operator"). A ticketUrl that fetch.ts reports BLOCKED stays in `needs_research` for a browser check; it is not dropped. These entries are drafts: Pipeline C researches every one before it is applied.
3. FAIRNESS: fairness.json per the proposer's checklist, scored across the whole region.
Final message: the fairness summary in five lines.
