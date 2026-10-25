# ACT run: brief for each destination's copy (Quill)

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Read WRITING.md ("Writing a destination",
"Voice") first. Do NOT edit src/ or any file except your own output file. Do not run git. Never put any personal email or
contact detail in a request header or a file.

You write ONE destination's copy. The approved proposal is in curation/act/region-act-canberra/placement.json
(`proposed_destinations`: id, name, category, rank, coordinates, defaultZoomSpanKm, name_evidence, spots in importance
order). The finished spot entries (names, bios, hours, costs) are in curation/act/quill/out-*.json: read them, so the
reasons and tips match what is actually there. Both destinations are approved: Canberra (rank 3) and Namadgi National Park
(rank 4).

Write `curation/act/quill/dest-<id>.final.json` = `{ "destination": {...}, "spots": [ids in importance order, the headline
first; give a new order if the draft's is wrong, ids never change], "notes": [...] }`, the shape of
curation/nz-rest/quill/nt-darwin-top-end/dest-litchfield.final.json. The destination object:
`{ id, name, country: "Australia", countryCode: "AU", timezone: "Australia/Sydney", continent: "Oceania", coordinates:
{latitude, longitude} (the visitor hub, from the proposal: not a centroid, not any spot's pin), category, defaultZoomSpanKm
(every spot of it within 75% of it: check from the final pins in out-*.json and widen it rather than leave one out), rank,
icon (one emoji), tagline, description (3-4 sentences), whyVisit, highlights, goodToKnow, bestMonths, bestTimeBlurb,
seasonalTags? }`.
- whyVisit: **3** reasons for rank 3-4 (2-8 words each, strongest first, each starting with a plain action verb: See, Walk,
  Tour, Climb, Visit, Cross ...; never a bare name; no second clause; promise only what is there whenever a visitor arrives:
  no events, no festivals, no passing states). Each reason is one of the destination's real draws that has an honest photo
  possible (the photo is found next), so name the thing, not a vague theme. `highlights`: one 2-3 word phrase per reason.
- goodToKnow: **3** for Canberra (rank 3), **2** for Namadgi (rank 4): each `{ icon, title (2-5 words), detail (<= 160
  characters, aim ~120) }`, practical things that trip up first-timers (booking, opening days, weather, safety, access).
  Specific beats generic. Facts only from sources; no filler.
- bestMonths (1-12, southern hemisphere) and bestTimeBlurb with exactly one `{months}`, one or two short sentences, NO
  semicolons, within two or three card lines (check `python3 scripts/curation/blurb-fit.py --text "<blurb>" --months
  <m,m,m>`; it must pass). Check the tagline with `python3 scripts/curation/tagline-fit.py --text "<tagline>"` (exactly two
  header lines; it must pass).
- seasonalTags only where a real recurring pattern drives crowds (autumn colour, a festival season); omit otherwise.
- No repetition between the description, the reasons, the tips and the tagline, nor with the other ACT destination. Never
  name a source in copy. No filler (stunning, iconic, breathtaking, must-see, world-class, hidden gem, picturesque,
  spectacular). A superlative only when a source states it as fact.
- Sources: Wikivoyage's Canberra pages, VisitCanberra, the national institutions' own sites, the Parks ACT summaries in
  curation/act/sources/parks-act-leads.json (parks.act.gov.au blocks scripts: list needed pages under notes as
  `needs_browser`), the spot outputs. Fetch with `npx tsx scripts/curation/fetch.ts <url>`.

Validate the file parses. Final message: the destination's reasons, tips and best months in a few lines, the tagline-fit and
blurb-fit results, and anything unverified.
