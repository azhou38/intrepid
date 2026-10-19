# Agent pipelines for curation

Roles and order for improving destinations, spots, photos and copy in the background (as scheduled cloud agents that open pull requests). **The rules live in the existing guides — do not restate them here:**

- coverage, placement, ranking, recall, coordinates → `COVERAGE.md`
- names, fields, voice → `WRITING.md`
- every photo, the pre-filter, headers, why-visit and spot photos, the header workflow and manifest → `IMAGES.md`

## Shared conventions
- **Unit of work:** one destination for imagery and writing; one **region** for coverage (`COVERAGE.md` → "The unit is a region"), so places between destinations are searched with the same effort as places inside them.
- **Batches of 5.** One branch and one pull request per batch of **5 destinations** (coverage: one region per pull request), with **one commit per destination** so any single destination can be reverted on its own. Never merge: the agents only open pull requests.
- **Pull request mechanics (verified by the cloud probe):** `git push` of a branch works; `gh pr create` does **not** (GitHub's GraphQL API is blocked in cloud sessions), so open the PR with the REST API: `gh api repos/azhou38/intrepid/pulls -f title=… -f head=<branch> -f base=main -f body=…`, then assign it to `azhou38` through the REST API so GitHub notifies the owner.
- **Title and body:** the title names the destinations ("Wellington, Napier, Rotorua, …: photos and copy"); the body carries the evidence (sources, contact sheets, coverage table).
- **Notify on completion:** send a push notification ("N destinations updated, PR ready") with the pull request link.
- **One writer per file:** each agent writes only its own output file; a single merge step edits `src/data/*`. No shared scratch folders.
- **Evidence on every PR:** sources for facts, before/after contact sheets for photos, an evidence table for coverage.
- **Scripts do the objective checks:** `npx tsc --noEmit`, `scripts/check-destination-headers.ts`, `scripts/audit-spot-coordinates.ts`, `scripts/build-image-manifest.ts` (slow; its own job).
- **Backlog order:** weakest first — for coverage, regions that have never had a region pass come before everything else; then archival or reused photos, generic bios, ambiguous names, few spots, benchmark failures.

## Pipeline A — coverage (destinations, spots, orphans)
Runs **per region** and keeps inclusion separate from placement, so a place's chance of getting in does not depend on whether a destination surrounds it (`COVERAGE.md` → "Finding what is missing").
1. **Enumerator** — the region's candidates from sources, across all of its land, with each candidate's score (`views`, `counted_sources`) and coordinates. It does not look at our destinations.
2. **Recall checker** — every candidate not already in the app, and every existing spot in the region, gets a verdict (`keep` / `reject` / `review`) on "What qualifies" alone, with a reason. It is given the candidates **without** any destination or span information. Silence is not allowed.
3. **Skeptic** — challenges the verdicts on the same blind terms (overlap, no real draw, vehicle as spot, ephemeral) and checks the photos. It must not reject or keep anything because of where it is.
4. **Proposer** — only now places each kept candidate: a spot of a destination, a standalone spot, or a new destination (`COVERAGE.md` → "Where a spot goes"). A kept place is never dropped here for want of a home.
5. **Verifier (script + report)** — names, ids, spans, coordinate audit, and the **fairness report** (`COVERAGE.md` → step 5): lowest-scoring kept spots, higher-scoring candidates left out with their reasons, the inside/standalone split, the strongest outsiders. The run is accepted only if every strong outsider left out has a concrete reason.
Benchmark: the full list in `COVERAGE.md` → "Finding what is missing" (Red Rocks, Kapiti Island, Lake Coleridge, Sumner Beach, Godley Head, Lyttelton, Birdlings Flat, Paradise, Hump Ridge Track, St Kilda Beach, Ohakune Carrot; Ninety Mile Beach standalone, not under Cape Reinga; Walter Peak High Country Farm in place of TSS Earnslaw; Pipiriki to review).
   - The skeptic must not hold back second-tier stops (a beach, headland or harbour town that one guide names); its job is to reject the rarely visited and the vehicle-as-spot.
   - Output per region in `curation/<branch>/region-<id>/`: `candidates.json`, `verdicts.json`, `skeptic.json`, `placement.json`, `fairness.json`. `scripts/curation-backlog.ts` counts a region as covered once its `fairness.json` is committed.

## Pipeline B — imagery
**Every photo that goes into the app is judged by Lens, including the photos of new spots.** A photo proposed by Atlas (the enumerator, the skeptic or the proposer) is a candidate, not an accepted photo: the new spot goes in, but its photo is applied only after the image-judge has looked at it against the four checks, the crop and the brightness floor (`photo_verdict: accept`). `apply-region.py` does not apply a photo without that verdict. Turangi, a town, shipped with a photo of a riverbank because new-spot photos were applied from the skeptic's pick unjudged; the judge is where "the photo shows the named thing" is enforced.
1. **Pre-filter (script)** — `IMAGES.md` → "Automatic pre-filter", over every photo in the app.
2. **Searcher** — region-qualified queries, Commons categories, geosearch near the coordinates.
   - Commons first (its licence data is clean and the app hot-links its thumbnails); prefer Featured, Quality and Valued images.
   - **Non-Commons search is mandatory, not optional:** every rejected or empty slot gets the fallback below in the same run, and the passing photo is downloaded, committed and registered (`IMAGES.md` → "When Commons has no suitable photo"). Queue *all* rejects (`scripts/curation/build-search-queue.py`), not just the first groups judged.
   - **Fallback when Commons has nothing usable:** use the order in `IMAGES.md` → "When Commons has no suitable photo" (openly licensed first: `scripts/openverse-search.py`, DOC images labelled Creative Commons; then official and tourism-organisation photos, a copyright risk to flag; blogs last). A spot is never dropped or left with a wrong photo for want of a Commons file.
   - Unsplash/Pexels only for headline destinations (their location tags are unreliable); tourism-board and Google Places photos are out (copyright / terms).
   - Cloud runs may hit Wikimedia 429s (see the rate-limit probe); run the Commons-heavy steps with backoff, or locally.
3. **Judge** — views the image, scores the checks with reasons. A photo may be shared by one destination's header, why-visit photos and spots (the Waitomo glowworm-boat photo is all three): the searcher proposes and the judge recommends the best photo for every slot, wherever it is already used in that destination; only reuse across different destinations fails.
4. **Second judge** — re-scores, blind, only the slots where the first judge proposed a new file; disagreement means the slot stays as it is and goes to the owner. A keep-current needs no second judge (nothing changes).
5. **Technical check (script)** — licence, size, manifest.
6. **Report** — the final report lists, under "Photos still missing", every slot for which no passing photo was found in any tier (Commons, openly licensed, official, blogs), with the current failing photo and what was tried.
Benchmark: Clyde, Hamilton, Blue Lake, the 1913 Government Gardens and the archive Blue Lake photo must all be rejected.

## Pipeline C — writing
**Every new spot goes through Pipeline C before it is applied**, whether it belongs to a new destination or an existing one. Atlas's placement entries are drafts: the proposer fills in what its sources gave, and leaves the rest empty for research, never with a placeholder. Sydney's 70 new spots were applied straight from placement, without research: 44 had no link, and spots such as Sea Life Sydney had no price and "Hours vary; check the operator" for hours. A spot is applied only when it has researched hours, a cost (`free: true` or a price) and a `ticketUrl` decision: a verified link, or a stated reason for none (many operators sell it; no single steward).
1. **Researcher** — facts with source links.
   - Includes each spot's official site (`WRITING.md` → `ticketUrl`): found from the operator, loaded and checked, deep links taken from the site's own navigation. A spot with an official site and no `ticketUrl` is a failed check.
   - Includes each spot's cost: the adult price from the operator's own page, or `free: true`. Never left empty.
   - A site that blocks scripts is reported `BLOCKED` with its URL, not dropped: whoever runs the pipeline checks it in a real browser (the in-app browser) before the spot is applied.
2. **Writer** — several variants in the app's voice (`WRITING.md` → "Voice").
3. **Fact-checker** — every claim against the sources; cut or flag the unverifiable.
4. **Editor** — style, repetition within and across entries.
5. **Reconciler** — couple the three reasons to their photos with Pipeline B.

## The run's final report (Atlas, Lens and Quill, every run)
**Nothing a run decided on its own is left silent.** Every run, of any pipeline, ends with a report to the owner that lists each of the following by name, with the reason. A thing that is not in the report did not happen. Do not summarise these away as "a few" or "some".
- **Left out or not added**, and why: a place rejected or sent to review (with the case for and against), a spot or destination skipped for any reason (a name that collides with an existing spot, a missing price, hours or link, a closed or no-access site, a destination not in the app, a tool limit), and anything held back. A held item says exactly what unblocks it.
- **Added or kept but weak**: a photo the judges called weak (what is wrong with it), a place kept on one counted source, a pin set from an approximate source, a price or hours taken from a snippet, aggregator or a single old page, a bio claim that could not be re-read. Name each one and what would fix it.
- **Needs the owner**: photos still missing (a section of its own, `IMAGES.md`), official or operator photos used without permission (copyright risk), links that were BLOCKED and need a real browser, new destinations proposed, existing spots removed, renamed or moved, and every decision the run made that the owner might want reversed.
- **Not verified**: what was not checked (a coordinate audit that was not run, a file page not opened, a price not found) and what would verify it.
Pipeline-specific items: Atlas also reports the benchmark result, the strongest candidates left out, and the standalone/inside-destination counts; Lens reports every photo slot's outcome (changed, kept, weak, none); Quill reports every spot skipped by the lint and every `ticketUrl` it could not verify.

## Cost and speed
The agents judge; scripts do everything else, and nothing is judged twice. (Wellington's first region pass used ~2.5M agent tokens, most of it on items that ended up unchanged.)
- **Scripts do the mechanical work.** `scripts/curation/score-candidates.ts` (Atlas: page views, coordinates, redirects, disambiguation pages, already-in-the-app matches), `scripts/curation/lint-entries.ts` (Quill: ticketUrl loads and names the place, paid spots without a link, spots with no cost that are not free, bio voice and length, photo titles that won't resolve, destination field counts), `scripts/photo-prefilter.ts` and `scripts/curation/lens-triage.ts` (Lens).
- **Triage before any agent.** Lens works only `search` and `confirm` slots (`lens-triage.ts`); Quill only the entries `lint-entries.ts` flags, or the owner names, and every new spot from Atlas (it has never been researched, so a clean lint proves nothing about it); the Atlas skeptic only keeps, reviews and rejects that rest on "no counted source".
- **Second judge only on proposed changes** (Pipeline B step 4).
- **Cheaper models for mechanical roles**: `model: haiku` in `coverage-enumerator` and `reconciler`; the judging, writing and fact-checking roles keep the session's model.
- **Short role briefs.** Each `.claude/agents/*.md` carries a checklist of the rules its role needs; the guides stay the authority and are opened only for a case a checklist doesn't settle. Keep the checklists in step when a guide changes.
- **Cache between steps and runs.** Agents fetch pages with `npx tsx scripts/curation/fetch.ts <url>` (cache in `.cache/curation/http/`, not committed; 14 days, failures 1 day; captcha walls reported as BLOCKED), and the scripts use the same cache. Accepted photos are recorded per slot in `scripts/curation/photo-verdicts.json` (`scripts/curation/record-verdicts.ts`, or `--owner` for a photo the owner supplied); `lens-triage.ts` skips them on every later run.

## Build order
Pipeline B first (most objective checks), then A, then C.

## What is implemented
- **Scripts (deterministic):** the `scripts/curation/` tools in "Cost and speed"; `scripts/photo-prefilter.ts` (Pipeline B step 1 and the technical check; hard fails plus colour "review" flags, cached per file in `scripts/prefilter-cache.json`) and `scripts/curation-backlog.ts` (weakest-first ranking and the next batch of 5). Existing: `check-destination-headers.ts`, `audit-spot-coordinates.ts`, `build-image-manifest.ts`.
- **Roles:** one subagent per role in `.claude/agents/` (`image-searcher`, `image-judge`, `coverage-enumerator`, `coverage-recall-checker`, `coverage-proposer`, `coverage-skeptic`, `spot-researcher`, `copy-writer`, `fact-checker`, `copy-editor`, `reconciler`). They point at the guides and add no rules of their own.
- **Orchestration:** one prompt per pipeline in `.claude/routines/` (`b-imagery.md`, `a-coverage.md`, `c-writing.md`). A cloud routine's prompt is just "follow `.claude/routines/<file>`", so changing a pipeline is a normal pull request.
- **Pre-filter findings are inputs, not verdicts.** A hard fail is objective (an archive date, a map or flag category, too small, one photo used for two different destinations); a few can be false positives (a flags category on a Times Square photo), so the judges look at them. "Review" flags are colour heuristics that a sunset can trip.

## Running the pipelines (lessons from the New Zealand run)
- **Where the prompts and helpers live:** per-job prompts in `.claude/routines/jobs/` (`job-first.md` and `job-second.md` for imagery; `jobA-region.md`, `jobA-skeptic.md` and `jobA-place.md` for coverage. The per-destination and country-level coverage prompts used in the first New Zealand run were retired: they searched destinations far harder than the land between them), search helpers `scripts/commons-candidates.py` and `scripts/openverse-search.py`, and `scripts/apply-coverage.py` to apply a kept proposal (it still reads the retired per-destination files, `coverage-proposal.json` and `coverage-skeptic.json`; update it to read a region's `placement.json` and `skeptic.json` before the first region run). Each destination's evidence is written to `curation/<branch>/<destination>/` and committed, so a rerun skips what is finished.
- **Rate limits are the main failure.** Wikimedia answers 429 in bursts, and Nominatim and Overpass refuse or time out when several agents share an IP; Overpass was unusable. Agents should pace requests (about 1 per second), back off on 429, and fall back to the Wikipedia coordinates API and Commons geotags. The cloud environment's shared IP is throttled harder than a home connection (see the rate-limit probe), so run the Wikimedia-heavy steps locally.
- **A usage-limit stop kills every running agent at once.** Launch in waves of about ten, not all at once, and make each stage resumable from the files it already wrote.
- **A "none" from the first judge needs no second judge** (nothing to re-score); a finalist always does. Where the two judges pick different files, use one both accepted.
- **A missing photo never blocks a spot or destination.** The photo search must try every tier, Commons then non-Commons, before giving up. If no passing photo exists, the spot or destination is still added, and the run's final report asks the owner to provide a photo for it ("Photos still missing"). Nothing is held back or dropped for want of a photo.
- **Applying edits to `src/data`:** one writer (the reconciler or `scripts/apply-coverage.py`), one commit per destination; rebuild the manifest (`scripts/build-image-manifest.ts`), then run `tsc`, the header check, `scripts/photo-prefilter.ts` and `scripts/audit-spot-coordinates.ts`. The audit's "in water" flags are often a beach or lake edge, so move the point onto land with a Mapbox tilequery rather than trusting a rounded coordinate.
- **Stricter bar, review list.** The skeptic keeps only what passes `COVERAGE.md` → "What qualifies"; marginal places go to a review list in the pull request for the owner (weekly markets, festivals and exterior-only civic buildings never qualify).

