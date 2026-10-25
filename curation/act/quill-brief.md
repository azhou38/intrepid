# ACT run: brief for every pins + facts + copy shard (Quill)

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Read WRITING.md (names, spot fields, voice,
"What the cost is for") and COVERAGE.md "Verifying coordinates" before you start. Do NOT edit src/ or any file except your
own output file. Do not run git. Never put any personal email address or contact detail in a request header or a file.

Input: your shard file `curation/act/quill/in-<N>.json` = `{ spots: [...] }`: draft spots from Atlas (id, name,
destination, category, icon, bio draft, wiki, coordinates hint or null, `pin` (the resolve-pin.py result the run already
computed: recommended point, confidence HIGH/MEDIUM/LOW, candidates), source_urls, needs_research, reason). Every place here
is approved by the owner: never drop one; if you find it should not be added (closed, no public access, a duplicate), say so
in `notes` with the evidence and still write what you can.

For every spot produce a finished entry:
`{ name, icon, category, bio, hours, closedDays?, visitHoursMin, visitHoursMax, coordinates: {latitude, longitude},
wiki (only if the Wikipedia article title differs from name and the article is about this place; else omit),
free: true | costMin/costMax/currency 'AUD', costBasis, costPer?, needs?, ticketUrl (or omit with `ticket_note` saying why),
coordinates_source, notes }`

1. PIN: use the `pin` already computed (HIGH or MEDIUM only). Where it is LOW or missing, run `python3
   scripts/curation/resolve-pin.py --name "<spot>" --category <category> --lat <hint> --lon <hint> [--wiki "<title>"]`
   yourself (never more than one call at a time in your shard; the Nominatim fallback paces itself), taking a hint from the
   place's own Wikipedia/Parks ACT/VisitCanberra page. Rules (COVERAGE.md): a park or reserve at its visitor point (visitor
   centre, day-use area, main lookout or car park; NEVER the centroid a leisure=nature_reserve or boundary=protected_area
   returns; never a point shared with another spot); a town at its OSM place centre; a walk, track or trail at the midpoint
   of the whole route (resolve-pin reports "trail midpoint"; the Canberra Centenary Trail at the midpoint of the whole
   145 km loop); a summit or lookout on the feature; a homestead or building on the building. Every spot must be >= 25 m from
   every other spot's pin (the app's in src/data/spots.ts and src/data/destinations.ts, and the rest of your shard). Never
   memory, never three decimals or fewer, never a town page's point for an attraction. On LOW: take the managing agency's
   car park or trailhead point from a source and say so in coordinates_source, or set `"pin": "LOW"` in notes so the run
   raises it.
2. FACTS: hours (the spot's own local time, Australia/Sydney), cost, official ticketUrl, visit hours range
   (quarter-hour steps under an hour; WRITING.md). Sources: the operator's or steward's own pages (the National Capital
   Authority, the national institutions' sites, the ACT Government's Parks and Conservation pages, VisitCanberra,
   Wikivoyage). parks.act.gov.au blocks scripts: list its pages under `needs_browser` with the URL (the run reads them in
   the in-app browser), and curation/act/sources/parks-act-leads.json holds the agency's recreation-area names and
   descriptions. Fetch with `npx tsx scripts/curation/fetch.ts <url>`. A blocked page (403, "Just a moment") goes under
   `needs_browser` with the URL; blocked is not a reason to drop the link. Never invent: no placeholder hours ("Hours
   vary; check the operator" is forbidden); `Open 24 hours` for open-access places, or the sourced range; anything
   unsourced goes under `unverified`. Seasonal or closure facts go in the bio only if they fit, otherwise in notes.
   Cost (WRITING.md "What the cost is for"): the typical adult price (`costMin`/`costMax`, `currency: 'AUD'`) or `free:
   true`, and `costBasis`: `entry` (paying to get into a place, "Entry (Adult)", or free with no entry fee), `tour` (a
   guided tour), `ticket` (a ride or activity where being there is free), `park` (the spot is itself a park and the price is
   its entry fee, with `costPer` such as "Per Vehicle/Day"), or `donation` (free, donation asked). Parking is never the
   price. The ACT's nature reserves and lookouts are free: a spot inside a reserve is not `needs: 'park-pass'` (there is no
   park pass in the ACT's Canberra Nature Park, Namadgi or Tidbinbilla unless a page you read says there is one).
   Free national institutions are `free: true, costBasis: 'entry'`; a paid exhibition inside is not the spot's price.
3. BIO: one sentence, >= 10 words, what it is, where, and the one thing that makes it worth a stop; must fit three card
   lines (check `python3 scripts/curation/bio-fit.py --text "<bio>"`). Facts from sources only; a superlative only when a
   source states it as fact ("the world's largest ..."), never an opinion ("most beautiful"); no source names in copy; no
   filler words (stunning, iconic, breathtaking, must-see, world-class, hidden gem, picturesque, spectacular). Promise
   only what is there whenever a visitor arrives (WRITING.md "Voice"): no events, no passing states.
4. NAMES: the place's own name in title case, no town or region qualifier ("Mount Ainslie", not "Mount Ainslie, Canberra");
   apply the renames in the draft's note. `wiki` is the exact Wikipedia title only if it differs from name and the article
   is this place (not a broader article it redirects to).
5. VOICE: facts from sources only, never name a source in copy, concrete, not marketing; no repetition across
   neighbouring spots' bios.

OUTPUT: `curation/act/quill/out-<N>.json` = `{ "spots": { "<id>": {...}, ... }, "unverified": [...], "needs_browser": [ {id,
url, why} ], "notes": [...] }`. Validate that it parses (`python3 -c "import json;json.load(open(path))"`). Final message:
counts, every unverified, LOW pin and needs_browser item by name, and anything you judged should not be added (with why).
