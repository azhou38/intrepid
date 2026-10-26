# SA run: brief for every coverage-judge shard

Repo root: /Users/alexzhou/Developer/mobile-wellington (run every command from there). Your role is
.claude/agents/coverage-judge.md and the job is .claude/routines/jobs/jobA-judge.md (read both first), with these
differences for this run:

- The region's marginal band may be split into shards. Judge ONLY your shard file,
  `curation/sa/region-<REGION>/marginal.part-<N>.json`, and write `curation/sa/region-<REGION>/judged.part-<N>.json`
  (a list, one entry per shard entry, same shape as judged.json: `{ name, verdict, reason, objection }`). Silence is not
  allowed: every entry gets a verdict.
- Only shard 1 of each region also re-decides the audit sample: read `audit.json` and write `audited.json` exactly as the
  job says. Other shards do not touch audit files.
- Each entry carries its full candidate (`candidate`: wiki, sources, note, coordinates). Region boundaries are in
  curation/sa/sa-regions.md; a place that lies in another region gets `reject` with the reason "outside the region:
  belongs to <region id>" (that region covers it), never a keep.
- Fetch with `npx tsx scripts/curation/fetch.ts <url>` (shared cache), about one request a second.
- Rules that came up in earlier runs (COVERAGE.md "What qualifies"):
  - A church, chapel or cathedral is never kept for being a church, nor rejected for it: keep it only when a visitor
    source names something to see or do there (an interior visitors go in for, notable art or architecture, a tour, a
    landmark a guide singles out).
  - Operators, tours, cruises, charters, scenic flights, shops, restaurants, cafés, bars, accommodation and caravan
    parks are rejected (a spot is a place, not the way you get there or a business). A winery, brewery or distillery is
    a place to go only when a visitor source singles it out as a destination in its own right (a landmark estate a
    guide names, such as Seppeltsfield or the d'Arenberg Cube, not one of dozens of cellar doors); otherwise reject with
    that reason. South Australia has hundreds of cellar doors: hold this line.
  - Events, festivals, seasonal or weekly markets and recurring shows are rejected (the Adelaide Central Market, which
    trades most days, is a permanent venue). A seasonal natural spectacle (the Whyalla giant cuttlefish aggregation,
    southern right whales at the Head of Bight) is judged on whether a visitor can go to a place to see it: keep the
    place, with the season noted.
  - Unsafe, closed or no-access places (anything a source says is closed, private land, Defence land such as the
    Woomera range) are rejected; an open part of them (the Woomera Heritage Centre) is judged on its own.
  - Towns: a town a guide gives its own section, or that visitors base themselves in, is kept (the proposer decides
    whether it becomes a destination or a spot). A town with nothing a source names to see is reject or review.
  - Duplicates (two names for one place, a feature inside a larger candidate) are rejected with "duplicate of <name>"
    or kept as one: say which in the reason. Dual names (Ikara / Wilpena Pound, Kati Thanda-Lake Eyre) are one place.
- Never read src/data/destinations.ts (blind to placement).

Final message: your shard's counts (keep / reject / review), the review list by name, and for shard 1 the audit
disagreements by name.
