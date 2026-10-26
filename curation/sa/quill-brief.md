# SA run: brief for every pins + facts + copy shard (Quill)

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Read WRITING.md (names, spot fields,
destination fields, voice, "What the cost is for") and COVERAGE.md "Verifying coordinates" before you start. Do NOT edit
src/ or any file except your own output file. Do not run git.

Input: your shard file `curation/sa/quill/<REGION>/in-<N>.json` = `{ destinations: [...], spots: [...] }`: draft spots
from Atlas (id, name, destination or null for standalone, category, icon, bio draft, wiki, coordinates hint or null,
sources, needs_research, note) and, if your shard holds a destination, that destination's draft (id, name, category,
rank, coordinates, defaultZoomSpanKm, name_evidence, spots: its ordered spot ids, some of which may be in another shard).
Every place here was kept by the coverage judge: never drop one; if you find it should not be added (closed, no public
access, a duplicate), say so in `notes` with the evidence and still write what you can.

For every spot produce a finished entry:
`{ name, icon, category, bio, visitHoursMin, visitHoursMax, coordinates: {latitude, longitude}, wiki (only if the
Wikipedia article title differs from name and the article is about this place; else omit), free: true |
costMin/costMax/currency 'AUD', costBasis, costPer?, needs?, ticketUrl (or omit with `ticket_note` saying why),
coordinates_source, notes }`. Spots carry NO opening hours (no hours, closedDays or specialClosures): never research or
write them; a fact that truly matters (a tour only on weekends, a seasonal closure) goes in the bio if it fits, or notes.

1. PIN: `python3 scripts/curation/resolve-pin.py --name "<spot>" --category <category> --lat <hint> --lon <hint> [--wiki "<title>"]`.
   Never run more than two resolve-pin calls at once in your shard (Nominatim and Overpass rate-limit). Use a HIGH or
   MEDIUM point only. Rules (COVERAGE.md): a park at its visitor point (visitor centre, day-use area, main lookout or car
   park; NEVER the reserve centroid that leisure=nature_reserve or boundary=protected_area returns; never a point shared
   with another spot); a town at its OSM place=town/village centre; a walk/track at the midpoint of the whole route
   (resolve-pin reports "trail midpoint"); a summit or lookout on the feature; a beach on its natural=beach feature; a
   cave, sinkhole, gorge or falls at the feature or its car park. When the hint is null, take a hint from the place's
   Wikipedia/NPWS/South Australian Tourism page (that hint is only for the search). Every spot must be >= 25 m from every
   other spot's pin and its destination's pin (check against src/data/spots.ts, src/data/destinations.ts and the rest of
   your shard). Never memory, never 3 decimals or fewer, never a town page's point for an attraction. On LOW: take the
   managing agency's car park/trailhead point from a source and say so in coordinates_source, or set `"pin": "LOW"` in
   notes so it is raised to the owner.
2. FACTS: cost and what it is for (WRITING.md "What the cost is for"): `free: true` with costBasis 'open' (nothing to pass
   through: a town, beach, lookout, open trail) or 'entry' ("No Entry Fee": a museum, garden or fenced site that is free);
   an adult price with costBasis 'entry', 'tour' or 'ticket'; a South Australian park's own vehicle entry fee as
   costBasis 'park' with costPer 'Per Vehicle/Day' (NPWS SA charges per park: read the fee from the park's own
   parks.sa.gov.au page or its "Book & pay" entry, never guess; a park with no entry fee is free, costBasis 'open'
   unless it has a staffed gate); 'booking' / 'permit' in `needs` where required (a Desert Parks Pass for the Simpson
   Desert / Witjira parks is a permit: record it in notes with its source). Parking is never a cost. Official
   ticketUrl: the operator or steward (for parks the NPWS page https://www.parks.sa.gov.au/parks/<slug>, loaded and its
   title checked; never an aggregator or a guessed domain). Visit range (quarter-hour steps under an hour; one unit per
   range, WRITING.md). Sources: official operator and agency pages, parks.sa.gov.au, southaustralia.com, the regional
   boards, council visitor sites, Wikivoyage. Fetch with `npx tsx scripts/curation/fetch.ts <url>`. A page that blocks
   scripts (403, "Just a moment"): list it under `needs_browser` with the URL so it is checked in the in-app browser;
   blocked is not a reason to drop the link. Never invent; anything unsourced goes under `unverified`.
3. BIO: one sentence, >= 10 words, what it is, where, and the one thing that makes it worth a stop; must fit three card
   lines (check `python3 scripts/curation/bio-fit.py --text "<bio>"`). Facts from sources only; a superlative only when a
   source states it as fact, never an opinion; no source names in copy; no filler words (stunning, iconic, breathtaking,
   must-see, world-class, hidden gem, picturesque, spectacular).
4. NAMES: the place's own name in title case, no town or region qualifier; apply the renames in the draft's note. `wiki`
   is the exact Wikipedia title only if it differs from name and the article is this place (not a broader article it
   redirects to).
5. DESTINATIONS in your shard: write `{ destination: { id, name, country: 'Australia', countryCode: 'AU', timezone:
   'Australia/Adelaide', continent: 'Oceania', coordinates (the visitor hub / town centre / park visitor point from
   resolve-pin, not a centroid, not any spot's pin), category, defaultZoomSpanKm (check every spot of it lies within 75%
   of it; widen it rather than leave one out), rank, icon, tagline, description (3-4 sentences), whyVisit (4 for rank
   1-2, 3 for rank 3-4, 2 for rank 5; each 2-8 words starting with an action verb; GENERAL reasons naming a kind of
   experience, as Kaikōura's "Watch sperm whales year-round", not a list of its spots; an attraction core or iconic to
   the destination, such as Remarkable Rocks for Kangaroo Island, may still be named), highlights (one 2-3 word phrase
   per reason), goodToKnow (3 for rank 1-3, 2 for rank 4-5: icon, title 2-5 words, detail <= 160 characters, aim ~120),
   bestMonths, bestTimeBlurb (one {months}, no semicolons), seasonalTags? }, spots: [ids in importance order], notes }`,
   the shape of curation/wa/quill/wa-perth/dest-perth.final.json. Check the tagline with
   `python3 scripts/curation/tagline-fit.py --text "<tagline>"` (exactly two header lines) and the best-time sentence with
   `python3 scripts/curation/blurb-fit.py --text "<blurb>" --months <m,m,m>` (two or three lines); both must pass.
   Seasons are southern-hemisphere: the Outback and the Flinders are best in the cooler months (about April to
   October; summer heat is extreme), the coast and the islands in spring to autumn. The destination's spots stay in
   importance order, the headline first; if the draft order is wrong, give the new order (ids stay).
6. VOICE: facts from sources only, never name a source in copy, concrete, not marketing; no repetition between a
   destination's description, reasons and tips, nor across neighbouring destinations.

OUTPUT: `curation/sa/quill/<REGION>/out-<N>.json` = `{ "spots": { "<id>": {...}, ... }, "destinations": [ { "destination":
{...}, "spots": [...], "notes": [...] } ], "unverified": [...], "needs_browser": [ {id, url, why} ], "notes": [...] }`.
Validate that it parses (`python3 -c "import json;json.load(open(path))"`). Final message (at most 8 lines): counts,
every unverified, LOW pin and needs_browser item by name, and anything you judged should not be added (with why).
