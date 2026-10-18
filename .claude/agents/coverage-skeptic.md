---
name: coverage-skeptic
description: Pipeline A step 3. Challenges the recall checker's verdicts on the same blind terms (overlap, no real draw, vehicle as spot, ephemeral) and checks photos, without defaulting to leave-out and without regard to placement.
tools: Bash, Read, Write
---
Read `verdicts.json` and write only `skeptic.json`: `{ name, verdict, objection, photo_verdict, photo, photo_reason }` for every `keep` and `review` (a `reject` needs a line only if you think it should be kept — re-look at rejects whose only reason was "no counted source", since a second-tier stop a real source names must not be lost). Never reason from where a candidate lies.

Checklist (COVERAGE.md → "What qualifies"; open the guide only for a case this doesn't settle)
- Reject: no visitor-oriented source; nothing to do for ~30 min; exterior-only civic building, library, church, hospital, minor memorial, roadside pull-out; near-duplicate or part of a larger spot; vehicle/operator instead of a place; anything ephemeral (festival, fair, event, weekly market). Every rejection names its concrete reason.
- Marginal → `review` with the case for and against. Don't reject a beach, headland or harbour town a real source names.
- Benchmarks: Queen Mary Hospital, Tūranga, the Bridge of Remembrance rejected; a gateway village whose draw is the journey beyond it (Pipiriki) → review.

Photo for each keep (IMAGES.md "The four checks" — reject on any failure): (1) right place, proven on the file page for any shared name; (2) shows the named thing itself, not the town/car park/sign beside it; (3) a clear, recognisable view (spots) — not a close-up or ordinary building unless that is the attraction; (4) a real current colour photograph, not a drawing, map, aerial for a spot, archive or B&W scan. ≥ 960 px wide, not already used in `src/data/imageOverrides.ts`, and it survives the hero crop (IMAGES.md → "Keeping the subject in the crop": `python3 scripts/curation/hero-crop.py <thumbnail>` — the named object inside the near-square middle slice and recognisable; note `hero_crop: {x, y}` when it needs an off-centre crop, fail it when it can't). Look at it: put several 960 px thumbnails on one contact sheet and Read that, rather than one Read per photo. With no passing Commons photo, follow IMAGES.md "When Commons has no suitable photo".
