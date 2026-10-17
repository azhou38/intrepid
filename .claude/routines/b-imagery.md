# Routine: Pipeline B — imagery (Lens)

Run by the scheduled cloud routine "Intrepid imagery". Conventions (batches, one commit per destination, pull request mechanics, evidence, notification) are in `PIPELINES.md` → "Shared conventions"; photo rules in `IMAGES.md`. Do not merge anything.

1. `npm ci --ignore-scripts`. `npx tsx scripts/photo-prefilter.ts --json /tmp/prefilter.json`, then `npx tsx scripts/curation-backlog.ts --prefilter /tmp/prefilter.json --batch 5` for the batch (skip destinations named in an open pull request).
2. Triage: `npx tsx scripts/curation/lens-triage.ts --dest <id> … --out curation/<branch>/lens --prefilter /tmp/prefilter.json [--flag <slot>]`. It writes one task.json per destination with each slot `skip` (already accepted in scripts/curation/photo-verdicts.json), `confirm` (judge the current photo only) or `search`. A group with nothing but `skip` needs no agent.
3. Per group with work: `image-searcher` + first `image-judge` (`jobs/job-first.md`) → candidates.json, judge-1.json. Then a SECOND, blind `image-judge` (`jobs/job-second.md`) only on the slots where the first judge chose a new file — never on keep-current or confirm slots. A new file is applied only where both judges chose it; a split or "none" leaves the slot for the owner.
4. Apply the agreed picks (`imageOverrides.ts` / `destinations.ts` / `externalPhotos.json`), run `check-destination-headers.ts`, `photo-prefilter.ts`, `build-image-manifest.ts`, `tsc --noEmit -p .`, then record the outcomes: `npx tsx scripts/curation/record-verdicts.ts --task … --judge1 … [--judge2 …]` and commit `scripts/curation/photo-verdicts.json` with the destination.
5. One branch `curation/imagery-<date>`, one pull request through the REST API, assigned to `azhou38`; body with before/after contact sheets, each judge's reasons, and the slots left open. Then the push notification.
6. On Wikimedia 429, back off (30, 60, 120, 240 s); if it never clears, stop and say so in the notification.
