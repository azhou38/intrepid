# Routine: Pipeline B — imagery

Run by the scheduled cloud routine "Intrepid imagery". Conventions (batches of 5, one commit per destination, pull request mechanics, evidence, notification) are in `PIPELINES.md` → "Shared conventions"; the photo rules are in `IMAGES.md`. Do not merge anything.

1. `npm ci --ignore-scripts`. Run `npx tsx scripts/photo-prefilter.ts --json /tmp/prefilter.json`, then `npx tsx scripts/curation-backlog.ts --prefilter /tmp/prefilter.json --batch 5` and take the batch it prints (skip any destination named in an open pull request).
2. For each destination in the batch, work in `curation/<branch>/<destination-id>/`:
   a. `image-searcher` → `candidates.json` for every slot that failed the pre-filter or is missing (header, why-visit 1–3, failing spots).
   b. `image-judge` → `judge-1.json`; a second `image-judge`, told it is the second judge and not to read `judge-1.json` → `judge-2.json`. A slot is filled only when both choose the same file; disagreement means "none" and a note for the owner.
   c. Apply the agreed picks to `src/data/imageOverrides.ts` / `destinations.ts`, run `npx tsx scripts/check-destination-headers.ts`, `npx tsx scripts/photo-prefilter.ts`, `npx tsx scripts/build-image-manifest.ts`, `npx tsc --noEmit` (baseline 7 errors). Commit this destination alone.
3. One branch `curation/imagery-<date>`, one pull request through the REST API, assigned to `azhou38`, body with before/after contact sheets (thumbnails with links), each judge's reasons, and the slots left unfilled. Then send the push notification.
4. If Wikimedia returns 429, back off (30 s, 60 s, 120 s, 240 s); if it never clears, stop, open no pull request, and say so in the notification.
