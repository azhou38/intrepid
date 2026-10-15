# Agent pipelines for curation

Roles and order for improving destinations, spots, photos and copy in the background (as scheduled cloud agents that open pull requests). **The rules live in the existing guides — do not restate them here:**

- coverage, placement, ranking, recall, coordinates → `COVERAGE.md`
- names, fields, voice → `WRITING.md`
- every photo, the pre-filter, headers, why-visit and spot photos, the header workflow and manifest → `IMAGES.md`

## Shared conventions
- **Unit of work:** one destination (or one country for the destination list).
- **Batches of 5.** One branch and one pull request per batch of **5 destinations**, with **one commit per destination** so any single destination can be reverted on its own. Never merge: the agents only open pull requests.
- **Pull request mechanics (verified by the cloud probe):** `git push` of a branch works; `gh pr create` does **not** (GitHub's GraphQL API is blocked in cloud sessions), so open the PR with the REST API: `gh api repos/azhou38/intrepid/pulls -f title=… -f head=<branch> -f base=main -f body=…`, then assign it to `azhou38` through the REST API so GitHub notifies the owner.
- **Title and body:** the title names the destinations ("Wellington, Napier, Rotorua, …: photos and copy"); the body carries the evidence (sources, contact sheets, coverage table).
- **Notify on completion:** send a push notification ("N destinations updated, PR ready") with the pull request link.
- **One writer per file:** each agent writes only its own output file; a single merge step edits `src/data/*`. No shared scratch folders.
- **Evidence on every PR:** sources for facts, before/after contact sheets for photos, an evidence table for coverage.
- **Scripts do the objective checks:** `npx tsc --noEmit`, `scripts/check-destination-headers.ts`, `scripts/audit-spot-coordinates.ts`, `scripts/build-image-manifest.ts` (slow; its own job).
- **Backlog order:** weakest first — archival or reused photos, generic bios, ambiguous names, few spots, benchmark failures.

## Pipeline A — coverage (destinations, spots, orphans)
1. **Enumerator** — builds the candidate list from sources (`COVERAGE.md` → "Finding what is missing").
2. **Recall checker** — "what would a guidebook list that we don't?"; every gap proposed or rejected with a reason.
3. **Proposer** — spot / standalone / new destination / leave out, by the placement rules.
4. **Skeptic** — challenges additions that fail the rubric (overlap, no real draw). Does not default to "leave it out".
5. **Verifier (script)** — names, ids, spans, coordinate audit.
Benchmark: the full list in `COVERAGE.md` → "Finding what is missing" (Red Rocks, Kapiti Island, Lake Coleridge, Sumner Beach, Godley Head, Lyttelton, Birdlings Flat, Paradise, Hump Ridge Track, St Kilda Beach, Ohakune Carrot; Ninety Mile Beach standalone, not under Cape Reinga; Walter Peak High Country Farm in place of TSS Earnslaw).
   - The skeptic must not hold back second-tier stops (a beach, headland or harbour town that one guide names); its job is to reject the rarely visited and the vehicle-as-spot.

## Pipeline B — imagery
1. **Pre-filter (script)** — `IMAGES.md` → "Automatic pre-filter", over every photo in the app.
2. **Searcher** — region-qualified queries, Commons categories, geosearch near the coordinates.
   - Commons first (its licence data is clean and the app hot-links its thumbnails); prefer Featured, Quality and Valued images.
   - **Fallback when Commons has nothing usable:** Openverse (`api.openverse.org/v1/images`, no key needed, `license_type=commercial`), which also surfaces Flickr and similar. Accept only CC0, PDM and CC-BY; never NC or ND. Store the licence, author and landing URL in the manifest next to the file, and use only a source that allows hot-linking.
   - Unsplash/Pexels only for headline destinations (their location tags are unreliable); tourism-board and Google Places photos are out (copyright / terms).
   - Cloud runs may hit Wikimedia 429s (see the rate-limit probe); run the Commons-heavy steps with backoff, or locally.
3. **Judge** — views the image, scores the checks with reasons.
4. **Second judge** — re-scores finalists blind; disagreement means reject or ask a human.
5. **Technical check (script)** — licence, size, manifest.
Benchmark: Clyde, Hamilton, Blue Lake, the 1913 Government Gardens and the archive Blue Lake photo must all be rejected.

## Pipeline C — writing
1. **Researcher** — facts with source links.
   - Includes each spot's official site (`WRITING.md` → `ticketUrl`): found from the operator, loaded and checked, deep links taken from the site's own navigation. A spot with an official site and no `ticketUrl` is a failed check.
2. **Writer** — several variants in the app's voice (`WRITING.md` → "Voice").
3. **Fact-checker** — every claim against the sources; cut or flag the unverifiable.
4. **Editor** — style, repetition within and across entries.
5. **Reconciler** — couple the three reasons to their photos with Pipeline B.

## Build order
Pipeline B first (most objective checks), then A, then C.
