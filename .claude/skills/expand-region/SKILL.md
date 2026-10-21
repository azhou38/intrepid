---
name: expand-region
description: Add destinations and spots for a new country or region of the Intrepid app, end to end — define the region, find what belongs (Atlas), research and write it (Quill), choose photos (Lens), apply it to src/data, verify it, and end with the owner report. Use when asked to "add <country/region>", "expand to <place>", "build out <region>", or to run coverage for a region that has never had a pass.
---

# Expand to a new region or country

Orchestrates the existing curation pipelines for one region at a time. **The rules live in the guides; this skill is the order of work, the gates between steps and what to hand the owner.** Open a guide only for the case you are on: `COVERAGE.md` (what belongs, placement, ranking, pins), `WRITING.md` (names, fields, voice), `IMAGES.md` (every photo), `PIPELINES.md` (roles, scripts, cost). Roles are subagents in `.claude/agents/`; per-job prompts are in `.claude/routines/jobs/`.

Ground rules that have bitten before:
- **One region per run.** A region pass covers all of the region's land, destinations and the ground between them, judged blind to placement.
- **Nothing a run decided on its own stays silent**: the final report lists everything left out, weak, unverified or needing the owner (see "End of run").
- **Never merge, never publish without the owner's yes.** New destinations are proposals only; the owner approves them.
- **Keep the user's task list current** and run agents in waves of about ten (a usage-limit stop kills them all), each stage resumable from the files it wrote.

## 0. Frame the run
1. Ask only what you cannot derive: the country/region, and whether any areas are out of scope. Everything else follows from the guides.
2. **New country?** Do the `COVERAGE.md` → "New country or region checklist" first: `countryBounds.ts` (`BOUNDS`, `POPULARITY`, `LABEL_POINTS`), `CountrySheet.tsx` (`COUNTRY_FACTS`), the country's entry in `COUNTRY_DEFAULTS` in `scripts/curation/apply-region.py` (country, code, continent, timezone, currency), and `scripts/coverage-regions.json` (below). Run `npx tsc --noEmit` after.
3. **Define the regions** in `scripts/coverage-regions.json` under the country code: the country's own first-level tourism/administrative regions, each `{ id, name, destinations: [], standalone: [] }`, plus an optional `timezone`/`currency` where a region differs from the country default (Tasmania is `Australia/Hobart`). A region with nothing in the app yet starts empty. `npx tsx scripts/curation-backlog.ts --country <CC>` lists regions with no pass; take them in that order.
4. Create the branch for the run (`curation/<name>`). Evidence goes in `curation/<branch>/region-<id>/` and `curation/<branch>/quill/<id>/`.

## 1. Atlas — what belongs (`PIPELINES.md` → Pipeline A, routine `.claude/routines/a-coverage.md`)
For the region, in order:
1. `coverage-enumerator` → `candidates.json` from sources, not memory, across all the land; `npx tsx scripts/curation/score-candidates.ts` adds page views, coordinates and existing-spot matches.
2. `npx tsx scripts/curation/score-filter.ts --region-dir <dir>` → `marginal.json`, `auto-decided.json`, `audit.json`.
3. `coverage-judge` on the marginal band plus the audit sample → `judged.json`, `audited.json`; then `npx tsx scripts/curation/merge-verdicts.ts --region-dir <dir>`. Exit 2 means the script's rules do not fit the region: rerun the judge on every candidate.
4. `coverage-proposer` → `placement.json` and `fairness.json`: spot of a destination, standalone spot, or proposed destination (needs the name test and `name_evidence`).
5. **Gate:** reject the run (say why) if a strong candidate scoring above the lowest kept spot was left out without a concrete "What qualifies" reason, or the `COVERAGE.md` benchmark fails.

**Stop and show the owner** the proposed new destinations and the review list before going on; they approve or change each. Existing destinations are never changed unless asked.

## 2. Pins, before anything is written (`COVERAGE.md` → "Verifying coordinates")
Every new spot gets its point from `python3 scripts/curation/resolve-pin.py` (HIGH or MEDIUM, `coordinates_source` recorded), never from memory: a trail at the midpoint of the whole OpenStreetMap hiking relation, a park at its visitor point, a town at its centre, a summit on the summit. **Every place has its own point**: `lint-entries.ts` flags `pin-shared` (within 25 m of another spot) and `pin` (round coordinates). Both-correct pairs are separated to 25 m.

## 3. Quill — facts and copy (`PIPELINES.md` → Pipeline C)
`npx tsx scripts/curation/tier-spots.ts` sends free open-access places down the simple path (default facts, batch-written bio, one batched fact-check); everything else takes `spot-researcher` → `copy-writer` → `fact-checker` → `copy-editor`. A spot is applied only with researched hours, a cost (`free: true` or a price) and a `ticketUrl` decision. New destinations (once approved) also need: 2–4 `whyVisit` by popularity, **2–3 `goodToKnow` (3 for rank 1–3, 2 for rank 4–5), each detail at most 160 characters**, best months and a blurb with one `{months}`. A spot's `wiki` must be its own Wikipedia article; list a destination's spots in importance order (it decides which get map photos first).

## 4. Lens — photos (`IMAGES.md`, `PIPELINES.md` → Pipeline B)
Every photo, new spots' included, is judged: `lens-triage.ts` → `photo-prove.py` → `image-searcher` and `image-judge` (blind second judge on proposed changes only). **A photo shows the place itself or the place gets `NO_PHOTO`.** Commons first, then openly licensed, then official (a copyright risk to flag), then blogs, then the in-app browser for sites that block scripts. A missing photo never holds a spot or destination back; it goes under "Photos still missing". Check crop (`hero-crop.py`), brightness (`photo-brightness.py`) and that no two spots share a photo or subject.

## 5. Apply (`PIPELINES.md` → "Applying edits to `src/data`")
Always `--dry-run` first.
1. New destinations (approved): `python3 scripts/curation/apply-destination.py <final.json> --picks <picks.json>`.
2. Spots: `python3 scripts/curation/build-apply-placement.py <region-id>`, then `python3 scripts/curation/apply-region.py <region-id> --dry-run`, then without `--dry-run`. If it stops on evidence in two folders, pass `--evidence curation/<folder>`.
3. Standalone spots: add them to the region in `scripts/coverage-regions.json`. New spots need a district: `python3 scripts/curation/build-spot-districts.py --only <ids>` (check the result is a real council area, not the state).
4. One commit per destination, one for the region's standalone spots.

## 6. Verify
`npx tsc --noEmit`; `npx tsx scripts/check-destination-headers.ts`; `npx tsx scripts/audit-spot-coordinates.ts --country <CC>` (decide every flag); `npx tsx scripts/photo-prefilter.ts`; `npx tsx scripts/build-image-manifest.ts`; `python3 scripts/curation/bio-fit.py`; `python3 scripts/curation/photo-brightness.py`; `npx tsx scripts/curation/lint-entries.ts --region <id> --offline` (no `pin`, `pin-shared`, `no-ticket`, `district`, `shape` line for anything new). Optionally `scripts/curation/spot-popularity.ts` if the destination sheet's Popular Spots row should cover the new spots. Then look at the map on the phone or simulator: pins sit where the places are, names fit, nothing overlaps.

## End of run: the report the owner reads
List by name, with the reason, never "a few" or "some": **left out or not added** (and what unblocks each); **added but weak** (single-source places, approximate pins, prices or hours from one old page, weak photos); **needs the owner** (proposed destinations, review list, **photos still missing** as its own section, official photos used without permission, links blocked to scripts, anything removed or moved); **not verified**. Atlas also reports the benchmark result, the strongest candidates left out and the inside/standalone split; Lens every photo slot's outcome; Quill every spot the lint skipped and every `ticketUrl` it could not verify. Finish by asking the owner to supply a photo for each missing slot, and to approve or change each proposed destination.

## Cost
Scripts do the mechanical work and nothing is judged twice (`PIPELINES.md` → "Cost and speed"). Use the cheaper model for the mechanical roles, run the Wikimedia-heavy steps locally (cloud IPs are throttled), pace requests at about one a second with backoff on 429, and cache fetches with `scripts/curation/fetch.ts`.
