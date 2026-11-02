# Fiji run: final report (branch `curation/expand-region-fiji`, pushed; nothing merged to main)

## What was added
- New country FJ: `countryBounds.ts` (bounds stop at 180°, so Lau and eastern Taveuni lie outside the box; label point between Viti Levu and Vanua Levu; popularity 25), `CountrySheet.tsx` facts, `apply-region.py` defaults (Pacific/Fiji, FJD), 9 regions in `coverage-regions.json`, Fiji tourism sites in `photo-sources.json`.
- 9 destinations (owner waived the approval gate; each passed the name test with a Wikivoyage page, and `--check-new` found no overlap): Nadi (r2), Mamanuca Islands (r2), Coral Coast (r3), Yasawa Islands (r3), Suva (r3), Levuka (r3), Taveuni (r3), Vanua Levu (r4), Rakiraki (r5; reranked from 4 by hand check). Spots applied: Nadi 9, Mamanucas 7, Coral Coast 7, Taveuni 8, Yasawas 4, Suva 4, Levuka 3, Vanua Levu 3, Rakiraki 3 = 48, plus 9 standalone (Kadavu Island, Great Astrolabe Reef, Nabukelevu, Navala Village, Mount Tomanivi, Vanua Balavu, Lakeba, Vai'oa Beach, Oinafa Beach). 57 spots total.
- Atlas: 9 enumerators, 9 judges plus a second source-wider pass: 77 keep, ~190 reject, 83 review (not added).

## Needs the owner
- Destinations to change or remove: the 9 above. Levuka (3 applied of 6 kept), Vanua Levu (3 of 5) and Rakiraki (3 of 4) sit under the four-spot bar only because kept spots are held for a pin/price (lint `thin-destination`). Kadavu (Kadavu Island + 3) stayed standalone because it is under the bar.
- Held kept spots (not added): no sourced pin (Google Maps, OSM, Wikidata, Commons had nothing): Beqa Shark Reef, One Bay Beach, Ovalau Peak, Beverley Beach, Vidawa Rainforest Hike, Lesiaceva Point, Kavala Bay Waterfall, Bay of Islands (Vanua Balavu), Losa Beach. No cost found: Levuka Community Centre and Museum. Access unconfirmed: Caqalai (resort closed). Dropped: Savusavu Hills (no source names the trail). Need a map pin from the owner or agency map.
- Review list (83, not added): see `region-*/verdicts.json` (verdict review).
- Pins from Google Maps place pins (in-app browser, MEDIUM): Des Voeux Peak, Lake Tagimaucia, 199 Steps Mission Hill. Pins from a single Wikipedia/Wikidata point (MEDIUM/LOW): Great Astrolabe Reef, Rainbow Reef, Nanuya Lailai, Kadavu Island, Navatu Rock (one Wikivoyage tag), Koroyanitu (peak point, not the visitor point), Vai'oa Beach (check it is on land).
- Official photos used without confirmed permission: 17 non-Commons photos flagged `copyright_risk` in `lens/photos-report.json` (travel blogs, operators, resorts, Pocket Guide). fiji.travel photos are "used with permission".
- Links blocked to scripts and not browser-checked: fiji.travel pages for Biausevu (blank), Colo-i-Suva (404), Sawa-i-Lau, Kadavu Island, Natadola; manafiji.com (spam links). Spots with a charge and no ticketUrl (no steward found): Sabeto, Viseisei, Navala, Biausevu, Colo-i-Suva, Mana, Treasure, Bounty, Monuriki, Sawa-i-Lau, Rainbow Reef, Lovoni.
- Script fix made: `destination-header-policy.ts` now accepts an external-photo header (Tonga's headers already on main failed the manifest build without it). Blue Lagoon (Fiji) uses its own photo key `Blue Lagoon (Nanuya Lailai)` so Reykjavik's `Blue Lagoon` override is untouched.

## Photos still missing (20 slots)
Why-visit first: Coral Coast "beach" (why1), Nadi why1 (Sabeto pool) and why3 (spice/kava markets), Rakiraki why2 (rainforest beaches), Suva why1 (museum) and why2 (Colo-i-Suva pools, an official photo failed second judge), Vanua Levu why2 (rare birds).
Headers: Nadi, Suva, Rakiraki, Levuka (download 404).
Spots: Beqa Island (coral-coast-3), Lakeba, Lovoni (levuka-4), Viseisei (nadi-5), Oinafa Beach, Vai'oa Beach, Waitabu (taveuni-5), Lake Tagimaucia (taveuni-6), Labasa (vanua-levu-3).
Tried: Commons name and geo, Google Images (Apify), searcher agents on official/operator pages; fiji.travel pages needed the browser step and were only partly done. Please supply a photo for each.

## Weak or unverified
- Prices from resellers or one old page: Monuriki 160, Kula 70, Navua rafting 439, Rainbow Reef 462 (Vanua Levu resort rate card; likely high), Garden of the Sleeping Giant 18, Sabeto 30 (2017), Biausevu 25, Sawa-i-Lau 10 (2009), Colo-i-Suva 5. Leleuvia 180, Waitabu 70-100 (two price sets). Best months for all 9 destinations are May-Oct from general knowledge; sources only confirm cyclone season Nov-Apr.
- Tiebreak judge (30 contested photo slots) judged from contact sheets only; 8 agreed with the first judge, 20 with the second. Judges opened few file pages for web photos; Mamanuca picks (Google hits) and Levuka header crop are weakest.
- Benchmark (NZ) N/A. No region-level OSM sweep (Overpass down).
- Not run: a phone/simulator look at the map; `audit-spot-coordinates.ts` (needs network, not run); destination skeptic script (reads applied data only; checked by hand).
- Token counts per agent were not recorded in the ledger (agent usage figures were in the notifications: roughly 140 agents, ~12M tokens).

Branch link to open a PR: https://github.com/azhou38/intrepid/compare/main...curation/expand-region-fiji
