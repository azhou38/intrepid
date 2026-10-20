# Papua New Guinea: final report

Nine regions, 359 candidates enumerated, **74 spots added** (all standalone for now), **20 held**, **5 destinations proposed**, 89 places sent to review, 50 spots with no photo.
Everything is in `src/data/spots.ts` (the Papua New Guinea block of STANDALONE_SPOTS); the run's evidence is in `curation/png/`.

## Needs the owner
**Destinations proposed (not added; each needs your approval, then a description, reasons, tips, best months and a header):**
- **Port Moresby** (rank 3, 8 spots, span 50 km): Wikivoyage city page "Port Moresby" (See/Do/Buy listings); named in the Wikivoyage Papua New Guinea cities list; national capital and main international gateway
- **Kokoda Track** (rank 2, 3 spots, span 80 km): Wikivoyage article "Kokoda Track"; papuanewguinea.travel Northern Oro Province page names it the headline walk; 37,890 en.wikipedia views. Headline long trail, 
- **Alotau** (rank 4, 5 spots, span 125 km): Wikivoyage city page "Alotau"; provincial capital and gateway to Milne Bay (PNG Tourism "Milne Bay" dive region).
- **Madang** (rank 3, 6 spots, span 70 km): Wikivoyage page "Madang" (start point for the north coast); en.wikipedia Madang, 17,307 views.
- **Rabaul** (rank 3, 8 spots, span 60 km): Wikivoyage page "Rabaul" (also covers Kokopo, See items 1-7); PNG Tourism East New Britain page.
Until you approve, PNG has no destination, so it has no country pin or sheet on the world map: its spots show at about a 40 km view and in search. The five proposals' own entries (Port Moresby, Rabaul, Madang, Alotau, Kokoda Track) are *not* spots; if you decline a proposal, add it as a standalone spot. Kokoda Track has only 3 spots and stands only on the rank 1-2 headline exemption.

**Held, not added (each says what unblocks it):**
- **Adventure Park PNG**: no pin
- **Varirata National Park**: no pin
- **Sogeri Plateau**: no pin
- **Mount Michael**: no honest bio: Only fact found is that it is the highest point in Eastern Highlands (about 3,615 m) in remote Lufa District; no visitor source, access or activities. Send to review or drop.
- **Asaro Mudmen**: no pin; no published cost
- **Eastern Highlands Cultural Centre and Museum**: no pin; no published cost
- **J.K. McCarthy Museum**: no pin
- **Taekanda Cultural Centre**: no pin; no published cost
- **Western Highlands Cultural Centre**: no pin; no published cost
- **Boluminski Highway**: no pin
- **Yamamoto Bomber Wreck**: no pin
- **Gonubalabala**: no pin
- **Woodlark Island**: no honest bio: Sources give one line (remote island group with wood carvings); no access, activities or reef confirmation. Hold for review or drop.
- **USS Boston Wreck**: no pin
- **Balek Wildlife Sanctuary**: no pin
- **Magic Passage**: no pin
- **Lae Botanic Gardens**: pin only from a Wikipedia point for a point feature
- **Black Cat Track**: no pin
- **Garbuna Volcano**: no pin
- **Tufi Fjords**: no pin

**Photos still missing: 50 of 74 spots show a plain pin (NO_PHOTO), please supply a photo for each:** Port Moresby Nature Park, National Museum and Art Gallery, National Parliament of Papua New Guinea, Gordons Market, Loloata Island, Kerema, Kikori, Goroka, Mount Hagen, Kainantu, Mendi, Kundiawa, Tari, Kavieng, Lihir Group, Lorengau, Buka, Sohano Island, Mount Balbi, Nissan Island, Samarai, Tawali, Normanby Island, Fergusson Island, Trobriand Islands, Misima Island, Goodenough Island, Coastwatchers Lighthouse, Krangket Island, Lae, Rainforest Habitat, Wau, Bulolo, Bulolo Gold Dredges, Kokopo, Rabaul Volcano Observatory, Duke of York Islands, Kimbe, Owers' Corner, Popondetta, Buna, Gona, Wewak, Vanimo, Cape Wom, Vanimo Surf Breaks, Daru, Kiunga, Lake Murray, Tonda Wildlife Management Area.
What was tried: Commons by query, category and geosearch within 10 km of each pin; Flickr (CC BY / BY-SA / CC0 only); Unsplash and Pexels (blocked to scripts); Openverse (unreachable from this machine). The official/tourism tier was NOT reached: papuanewguinea.travel, the Kokoda Track Authority, CWGC and lodge sites block scripts and need a real browser. The default Wikipedia photos were wrong for most of these (maps, satellite images, flags, a Gaza cemetery for Bomana, a Persian manuscript for Tawali, a yam photographed in Reunion for Maprik, Seoul's Bukchon village for Madang Market), so they were removed rather than shown. Five spots' first-judge picks were rejected by the blind second judge (National Museum, Parliament House, Goroka, Tari, Kavieng, Rainforest Habitat, Rabaul observatory): they are in the list above.

**Links to check in a real browser (BLOCKED, so no ticketUrl):** the CWGC pages for Bomana, Lae and Bitapaka war cemeteries; the Rainforest Habitat operator link (a Visit Website button on the tourism listing); Museum PNG failed to load.

## Added but weak (name, what is weak, what would fix it)
- **Free assumed (16):** Mount Wilhelm, Mount Giluwe, Lake Kutubu, Mount Balbi, Rainforest Habitat, Duke of York Islands, Kimbe Bay, Buna, Gona, Maprik, Sepik River, Kairiru Island, Mushu Island, Cape Wom, Lake Murray, Tonda WMA: no entry fee is published; landowner or village fees are common in PNG and unconfirmed. Fix: a local source for each.
- **Hours without a source (19):** Tavurvur, Rabaul Volcano Observatory, Japanese Barge Tunnel, New Guinea Club Museum, Bitapaka, Kokopo museum, Duke of York, Kimbe Bay, Owers' Corner, Isurava, Buna, Gona, Maprik, Sepik River, Kairiru, Mushu, Cape Wom, Lake Murray, Tonda carry "Open 24 hours" (open-air) or "Daytime visits"; no source publishes hours.
- **Prices from a 2017 listing:** Tavurvur K5, Barge Tunnel K7, New Guinea Club Museum K5, Kokopo museum K10; they have no official site, so lint flags them `no-ticket`. **Owers' Corner and Isurava** carry the K350 international trekker permit; whether visiting the trailhead alone needs it is unknown.
- **Weak photos:** Kokopo museum (a wreckage exhibit, not the building), New Guinea Club Museum (interior), Madang Central Market (moderate confidence it is the central market), Kairiru and Mushu (Flickr, proven only by title), Sepik River (canoes, modest), Japanese Barge Tunnel (dark but above the floor); Madang Central Market and Tufi were brightened. Flickr photos are CC BY: credits are recorded, not shown.
- **Pins from area points:** islands, archipelagos, bays and rivers sit at Wikipedia/OSM area centres, not a visitor point (Louisiade Archipelago keeps its source's round point; lint flags it). The pin audit differs by more than 100 m for 34 spots, mostly island centroids; Tawali was moved onto the resort's OSM node. Overpass was down all run, so no spot got a second OSM source (17 are HIGH from resolve-pin's Photon fallback, the rest from the enumerators' OSM/Wikivoyage points).
- **Source conflicts:** Yamamoto wreck location (held), USS Boston identity (held), Karkar Island distance, Sohano memorial, heights of Mount Balbi and Mount Vineuo (bios leave the contested figures out).
- **Safety:** Black Cat Track (held) has a reported 2013 bandit attack; the Highlands pages warn of intertribal clashes in Hela, Enga, Southern Highlands and Mount Hagen. Tari, Mount Hagen, Goroka and Kainantu are in. Nothing in the app warns visitors yet.

## Left out / not added
Rejected and reviewed places per region are in `curation/png/region-*/verdicts.json` (every candidate has a verdict and reason) and each `placement.json` (`reviews`). Notable: events (Hagen Show, Goroka Show, Karkar Bilum Festival...), every lodge and dive operator, mine sites (Panguna, Ok Tedi), the Kokoda Track's villages and campsites as separate stops (part of the track), Wuvulu Island (no counted source; a dive-operator page might change that), Mount Michael and Woodlark Island (no honest bio), rivers, ranges and districts as labels.

## Not verified
Hours, prices and fees above; every `coordinates_source` is recorded but no pin was seen on a map; photos were judged from Commons and Flickr pages, not by the owner; unverified claims were cut by the fact-checker (20 of 71 drafted bios needed a fix: for example Mendi's market days, Gona's guide, Kimbe's hotels, Normanby's access).

## Cost and quality (new pipeline, agent tokens)
Total about 3.56M: enumerators 1.34M (9 regions, unchanged: the biggest lever), coverage judge 0.74M (including two regions rerun on the full path), proposer 0.10M, research 0.37M, writing 0.10M + simple bios 0.04M, fact-check 0.17M, photos 0.70M (search and first judge 0.38M, second judge 0.09M, non-Commons search 0.16M, its judge 0.08M).
- Judging a candidate cost about 1.7k tokens here against about 5.3k in the old chain (Lord Howe), a measured 3x on that stage; the total per added spot (about 48k) is close to the old Lord Howe 57k because PNG's photo search was far costlier and enumeration did not change.
- **The audit guards fired 2 times in 9 regions** (Islands 3/5, Highlands 1/5 disagreements): those regions ran the full judge path. The filter was recalibrated on this run (islands and hubs, performer names, shows, never script-reject for no-source).
- The photo proof cleared **0 of 74** slots: remote PNG photos are rarely geotagged near the pin, so the judge was still needed; it did correctly fail 52 wrong defaults mechanically.
- The writer step still needs the fact-check (28% of bios had an unsupported claim): do not drop it.
