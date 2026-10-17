# Job: Pipeline B, first pass (searcher + first judge) for ONE group
Repo: the repository root you were started in (edit nothing except candidates.json and judge-1.json in curation/<branch>/lens/<GROUP>/). Roles: .claude/agents/image-searcher.md and image-judge.md — their checklists carry the photo rules; open IMAGES.md only for a case they don't settle. Input: curation/<branch>/lens/<GROUP>/task.json from `npx tsx scripts/curation/lens-triage.ts`.

Each slot in task.json has a status:
- `skip` — already accepted (scripts/curation/photo-verdicts.json). Do nothing.
- `confirm` — nobody has judged the current photo. Judge it only: `keep-current`, or reject with the failed check (then search that slot as below).
- `search` — no photo, a pre-filter finding, or flagged by the owner. SEARCH up to 6 Commons candidates (Openverse etc. only if Commons has nothing), then JUDGE them and the current photo.
Look at photos on contact sheets (several thumbnails per Read) and read the file page of anything you'd choose. Fetch pages with `npx tsx scripts/curation/fetch.ts`. Wikimedia ~1 request/second, back off 30/60/120 s on 429.
Write candidates.json ({slot:[{file,page,width,height,licence,why}]}) and judge-1.json (per slot {candidates:[…], choice: '<file>'|'keep-current'|'none: <why>'}).
Final message: the slots where you chose a NEW file (these, and only these, go to the second judge), then one line per other slot.
