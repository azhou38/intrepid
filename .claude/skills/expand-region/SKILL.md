---
name: expand-region
description: Expand the app to a new region or country, or re-run coverage for one, by orchestrating Atlas (what belongs), Quill (facts and copy) and Lens (photos) one region at a time. Use when asked to "expand", "add", "cover" or "run Atlas/Quill/Lens on" a region, state or country.
---

# Expand to a new region or country

Orchestrates the existing curation pipelines for one region at a time. The rules live in the guides; this skill is the order of work, the gates between steps and what to hand the owner. Open a guide only for the case you are on: `COVERAGE.md` (what belongs, placement, destinations, ranking, pins), `WRITING.md` (names, fields, voice), `IMAGES.md` (every photo), `PIPELINES.md` (roles, scripts, cost, lean runs). Roles are subagents in `.claude/agents/`; per-job prompts are in `.claude/routines/jobs/`.

## Progress during the run

Show progress from the first minute, so the owner never has to ask where things are.

1. **Task list.** Before any work, create the app's task list (the `update_plan` tool) with the stages as steps, in this order, and keep exactly one step in progress:
   - Frame the run (country setup, regions)
   - Atlas: enumerate and score candidates
   - Atlas: judge the marginal band
   - Atlas: place what was kept
   - Atlas: check destinations (overlap + destination skeptic)
   - Owner review of proposed destinations (blocking)
   - Pins for new spots
   - Quill: research and write
   - Lens: photos
   - Apply to src/data
   - Verify
   - Final report

   For a multi-region run, add the region to each step name or repeat the list per region. Advance a step in the same message as the first tool call of the next one. If the plan changes, resend the whole list.
2. **A status line at every stage boundary.** One short line, always in the same shape: `Stage 3/12: Atlas judging, 24 of 61 marginal candidates judged, 38 kept so far (about 20 min left)`. Give counts that really exist (candidates, kept, spots researched, photo slots done, photos still missing) and an estimate only when it rests on measured pace. Never invent a percentage.
3. **Long stages report on a rhythm.** During agent waves (Atlas judging, Quill research, Lens search and judging), report after each wave finishes: how many items are done of the total, what is running now, anything held. If a wave runs longer than about ten minutes, say so and what it is waiting on (a rate limit, a blocked site).
4. **Blocking points are named.** When the run stops for the owner (proposed destinations, the destination skeptic's merges and demotions, the review list, an approval to apply), say it is waiting, list exactly what the owner must decide, and put the decision in the final box with one button per realistic answer.
5. **Tally as you go.** Keep a running list of what the final report will need: items left out, weak, unverified, needing the owner, photos still missing. Add to it at each stage so the final report is a read-out, not a reconstruction.
6. **Offer a live page for long runs.** For a whole-country run, offer once to publish a private progress page (an artifact) showing the stage list, counts and the running tally, updated at each stage boundary. Do not build it unasked.

## Ground rules that have bitten before

- **Cover everything the prompt names.** If the prompt is "Northern Territory", the run covers all of the Northern Territory; if it is "Iceland", all of Iceland: the land, its destinations, its spots and the ground between them, judged blind to placement.
- **Nothing a run decides on its own stays silent:** the final report lists everything left out, weak, unverified or needing the owner (see "End of run").
- **Never merge, never publish without the owner's yes.** New destinations are proposals only; the owner approves them. Existing destinations are never changed unless the owner asks or approves a destination-skeptic proposal.
- **A fresh, lean orchestrator** (`PIPELINES.md` → "Lean runs"). Start the run in a fresh session that only orchestrates: it runs the scripts, launches the workers, reads their short replies and the ledger, and keeps the tally. It never prints a JSON file, page text, a candidate list or an image into its own context.
- **The run ledger.** Before each stage, `python3 scripts/curation/run-ledger.py check <run> <stage>` (exit 0 = done with unchanged inputs, skip it); after it, `run-ledger.py mark <run> <stage> done --summary "…"`; `task` per shard or group. Read worker output with `run-ledger.py peek <file>` and `validate <kind> <file>`, never by printing files. `<run>` is `curation/<branch>`.
- **Workers get paths, return summaries.** Each worker's brief names its role, its input and output paths and the rules section it needs, nothing pasted. Its reply is at most 8 lines: what it wrote, counts, and every unresolved item.
- **Unresolved is an error, not a finding.** A source blocked, rate-limited or unreachable is recorded as unresolved and retried, never read as evidence against a place or a photo.
- **Waves and resumability.** Keep the owner's task list current and run agents in waves of about ten (a usage-limit stop kills them all), each stage resumable from the files it wrote.

## 0. Frame the run

Ask only what you cannot derive: the country or region, and whether any areas are out of scope. Everything else follows from the guides.

**New country?** Do `COVERAGE.md` → "New country or region checklist" first: `countryBounds.ts` (`BOUNDS`, `POPULARITY`, `LABEL_POINTS`), `CountrySheet.tsx` (`COUNTRY_FACTS`), the country's entry in `COUNTRY_DEFAULTS` in `scripts/curation/apply-region.py` (country, code, continent, timezone, currency), and `scripts/coverage-regions.json` (below). Run `npx tsc --noEmit` after.

**Define the regions** in `scripts/coverage-regions.json` under the country code: the country's own first-level tourism or administrative regions, each `{ id, name, destinations: [], standalone: [] }`, plus an optional timezone or currency where a region differs from the country default (Tasmania is `Australia/Hobart`). A region with nothing in the app yet starts empty. `npx tsx scripts/curation-backlog.ts --country <CC>` lists regions with no pass; take them in that order.

**Create the branch** for the run (`curation/<name>`). Evidence goes in `curation/<branch>/region-<id>/` and `curation/<branch>/quill/<id>/`.

**Photo search setup.** Check `APIFY_TOKEN` is set in `.env.local` and the Apify plan covers the run (about $0.005 per photo slot; the free plan stops at $0.25 a month, about 50 slots). Add the region's tourism board, regional tourism brands and parks agencies to `official_with_permission` in `scripts/curation/photo-sources.json`; photos from sites not listed there are labelled "permission not confirmed".

## 1. Atlas — what belongs

`PIPELINES.md` → Pipeline A; routine `.claude/routines/a-coverage.md`. For the region, in order:

1. **coverage-enumerator** (Haiku) → `candidates.json` from sources, not memory, across all the land; then `npx tsx scripts/curation/score-candidates.ts` adds page views, coordinates and existing-spot matches.
2. `npx tsx scripts/curation/score-filter.ts --region-dir <dir>` → `marginal.json`, `auto-decided.json`, `audit.json`.
3. **coverage-judge** (Sonnet) on the marginal band plus the audit sample → `judged.json`, `audited.json`; then `npx tsx scripts/curation/merge-verdicts.ts --region-dir <dir>`. Exit 2 means the script's rules do not fit the region: rerun the judge on every candidate.
4. **coverage-proposer** (Sonnet) → `placement.json` and `fairness.json`: spot of a destination, standalone spot, or proposed destination (needs the name test and `name_evidence`).
5. **Destination check:**
   - `npx tsx scripts/curation/destination-prescreen.ts --check-new <placement.json>`: any overlap involving a proposed new destination fails the run (`COVERAGE.md` → "No overlapping destinations"). Existing overlaps are grandfathered (`scripts/curation/destination-overlaps-grandfathered.json`) and left alone.
   - `npx tsx scripts/curation/destination-prescreen.ts --out <region-dir>/destinations --ids <new and changed destination ids>`, then one **destination-skeptic** (Sonnet) per bundle batch, plus one on `audit.json` (`COVERAGE.md` → "Checking destinations"). Its keeps and re-ranks of new destinations go into the proposal; its merges and demotions go to the owner.

**Gate:** reject the run (say why) if a strong candidate scoring above the lowest kept spot was left out without a concrete "What qualifies" reason, the overlap check fails, or the `COVERAGE.md` benchmark fails.

**Stop and show the owner** the proposed new destinations, the destination skeptic's merges, demotions and re-ranks, and the review list before going on; they approve or change each.

## 2. Pins, before anything is written

`COVERAGE.md` → "Verifying coordinates". Every new spot gets its point from `python3 scripts/curation/resolve-pin.py` (HIGH or MEDIUM, `coordinates_source` recorded), never from memory: a trail at the midpoint of the whole OpenStreetMap hiking relation, a park at its visitor point, a town at its centre, a summit on the summit. Every place has its own point: `lint-entries.ts` flags `pin-shared` (within 25 m of another spot) and `pin` (round coordinates). Both-correct pairs are separated to 25 m.

## 3. Quill — facts and copy

`PIPELINES.md` → Pipeline C.

1. `npx tsx scripts/curation/build-evidence.ts --placement <placement.json> --out <run>/evidence` first: every Quill worker starts from its spot's evidence bundle.
2. `npx tsx scripts/curation/tier-spots.ts` sends free, open-access places down the simple path (default facts, batch-written bio, one batched fact-check); everything else takes **spot-researcher → copy-writer → fact-checker → copy-editor** (Sonnet), in shards of about 5 spots.

A spot is applied only with a cost (`free: true`, or a price with its `costBasis`) and a `ticketUrl` decision. **No opening hours are researched or stored** (`WRITING.md` → "No opening hours").

New destinations (once approved) also need: 2–4 `whyVisit` by popularity; 2–3 `goodToKnow` (3 for rank 1–3, 2 for rank 4–5), each detail at most 160 characters; best months; and a blurb with one `{months}`. A spot's `wiki` must be its own Wikipedia article. List a destination's spots in importance order (it decides which get map photos first).

## 4. Lens — photos

`IMAGES.md`; `PIPELINES.md` → Pipeline B and "Lean runs" for the commands. Every photo, new spots' included, is judged, with no headline cutoff:

- **A.** `npx tsx scripts/photo-prefilter.ts --json <file>`, then `lens-triage.ts` → `photo-prove.py` (proven Commons photos skip the judges).
- **B.** `python3 scripts/curation/gather-photo-candidates.py <group-dir>` for every search slot: the Wikipedia lead image and Commons by name and by location first, then Google Images (Apify) for the slots Commons did not prove (a spot photo geotagged within 300 m whose file title starts with the place's name skips Google; headers and why-visit photos always get it), on one contact sheet per slot ranked by source (open licence, then official tourism and parks sites, then other sites). A failed or capped Apify call is recorded as unresolved and retried, never read as "no photo".
- **C.** First **image-judge** (Sonnet), one per destination group, on those sheets.
- **D.** `build-search-queue.py <queue> <region> --branch <branch> --country <CC>`: only the slots still empty, each with leads (Google's pages, the place's page from the official sites' sitemaps, what was tried), in shards of about 10. A rejected slot whose Google search was skipped is not queued: run the command the script prints (`gather-photo-candidates.py <group-dir> --slots <ids> --force --google-all`), then the first judge, then rebuild the queue. One **image-searcher** (Haiku) per shard, in parallel: it reads pages only with `page-images.py`, never searches Commons or Google, and lists pages that print BLOCKED. Then `build-search-queue.py --merge <queue> --branch <branch>` and the first judge on their finds. The main session opens the BLOCKED pages in the in-app browser.
- **E.** `python3 scripts/curation/second-judge.py build <lens-dir>` (scripted size, licence, reuse, brightness and crop checks; batches of about 35 slots across groups), one blind second judge (Sonnet) per batch on proposed changes only, then `second-judge.py split <lens-dir>`.
- **F.** The **reconciler** (Haiku) stages and applies what both judges chose.

**Licences:** CC0, public domain, CC BY, CC BY-SA and CC BY-ND (crop, zoom and brightening are display); no NC. Tourism and parks photos are used with permission; any other site's photo is "permission not confirmed" and flagged. A photo shows the place itself or the place gets `NO_PHOTO`. A missing photo never holds a spot or destination back; it goes under "Photos still missing". Check crop (`hero-crop.py`), brightness (`photo-brightness.py`) and that no two spots share a photo or subject.

## 5. Apply

`PIPELINES.md` → "Applying edits to src/data". Always `--dry-run` first.

- **New destinations (approved):** `python3 scripts/curation/apply-destination.py <final.json> --picks <picks.json>`.
- **Spots:** `python3 scripts/curation/build-apply-placement.py <region-id>`, then `python3 scripts/curation/apply-region.py <region-id> --dry-run`, then without `--dry-run`. If it stops on evidence in two folders, pass `--evidence curation/<folder>`.
- **Standalone spots:** add them to the region in `scripts/coverage-regions.json`.
- **Districts:** new spots need one: `python3 scripts/curation/build-spot-districts.py --only <ids>` (check the result is a real council area, not the state).
- **Approved destination-skeptic changes** (merges, demotions, re-ranks) are applied only as the owner approved them, and recorded in `scripts/curation/destination-verdicts.json`.

One commit per destination, one for the region's standalone spots.

## 6. Verify

`npx tsc --noEmit`; `npx tsx scripts/check-destination-headers.ts`; `npx tsx scripts/audit-spot-coordinates.ts --country <CC>` (decide every flag); `npx tsx scripts/photo-prefilter.ts`; `npx tsx scripts/build-image-manifest.ts`; `python3 scripts/curation/bio-fit.py`; `python3 scripts/curation/photo-brightness.py`; `npx tsx scripts/curation/lint-entries.ts --region <id> --offline` (no `pin`, `pin-shared`, `no-ticket`, `district` or shape line for anything new). Optionally `scripts/curation/spot-popularity.ts` if the destination sheet's Popular Spots row should cover the new spots. Then look at the map on the phone or simulator: pins sit where the places are, names fit, nothing overlaps.

## End of run: the report the owner reads

List by name, with the reason, never "a few" or "some":

- **Left out or not added**, and what unblocks each.
- **Added but weak:** single-source places, approximate pins, prices from one old page, weak photos.
- **Needs the owner:** proposed destinations; the destination skeptic's merges, demotions and re-ranks; the review list; photos still missing (its own section); official photos used without permission; links blocked to scripts; anything removed or moved.
- **Not verified.**

Atlas also reports the benchmark result, the strongest candidates left out, the inside/standalone split and the destination check's counts (flagged, passed, exempt, and each verdict). Lens reports every photo slot's outcome; Quill every spot the lint skipped and every `ticketUrl` it could not verify. Finish by asking the owner to supply a photo for each missing slot, and to approve or change each proposed destination and destination-skeptic proposal.

## Cost

Scripts do the mechanical work and nothing is judged twice (`PIPELINES.md` → "Cost and speed" and "Lean runs"). Models by role: Haiku for the enumerator, the gap-only image searcher and the reconciler; Sonnet for the Atlas judge, proposer and destination skeptic, the Quill roles, both image judges and the orchestrator. Run the Wikimedia-heavy steps locally (cloud IPs are throttled), pace requests at about one a second with backoff on 429, and cache fetches with `scripts/curation/fetch.ts`.
