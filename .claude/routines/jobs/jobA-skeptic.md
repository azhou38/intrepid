# Job: Pipeline A (coverage), skeptic + photo check, for ONE region
Repo: the repository root you were started in (edit NOTHING except curation/<branch>/region-<REGION>/skeptic.json). Role: .claude/agents/coverage-skeptic.md — its checklist carries the rules; open COVERAGE.md or IMAGES.md only for a case it doesn't settle. Input: verdicts.json and candidates.json. Do not read src/data/destinations.ts.

Challenge every `keep` and `review` (open at least one of its sources with `npx tsx scripts/curation/fetch.ts`), and re-look at any `reject` whose only reason is "no counted source". Rejections that give a concrete "What qualifies" reason need no second look — don't spend on them.
For each keep, find and LOOK at a photo (contact sheets of several 960 px thumbnails, then the file page of the one you pick); with no passing Commons photo, follow IMAGES.md "When Commons has no suitable photo".
Write skeptic.json: [{"name","verdict","objection","photo_verdict":"accept"|"reject"|"none","photo":null|{"file","page","width","height"},"photo_reason"}]. Final message: one line per change from the recall checker's verdict.
