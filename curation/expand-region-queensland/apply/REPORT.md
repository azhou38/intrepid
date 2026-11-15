# Queensland apply report

Adapter scripts (this folder): `build.py` (inputs for the apply scripts), `regions.py` (coverage-regions.json membership), `qld-lgas.py` (districts from the ABS LGA service). No apply script was edited.

## Destinations added (25, one commit each, no header, grey why-visit cards; photos come from Lens)
whitsundays, brisbane, gold-coast, cairns, kgari, sunshine-coast, daintree (rank 1-2); noosa, port-douglas, townsville, moreton-island, atherton-tablelands (3);
gold-coast-hinterland, scenic-rim, glass-house-mountains, sunshine-coast-hinterland, kuranda, magnetic-island, mission-beach, rockhampton, bundaberg, ingham, cooktown, winton (4); gladstone (5).
Applied in popularity order, so within a rank they sit in that order. Timezone Australia/Brisbane. One reason reworded: Brisbane "Cuddle koalas at Lone Pine" -> "Meet koalas at Lone Pine".

## Spots applied: 218 (169 under their destination, 49 standalone), one commit per destination plus one for standalone
Spots are in a new `QUEENSLAND_SPOTS` array in spots.ts (one literal grew too long for tsc: TS2590); apply-placement.py appends standalone spots to the last array holding standalone lines (JIANGSU_SPOTS), so future runs need the same move.
Standalone `black-stump` clashed with an existing SA spot id: the Blackall one is `black-stump-blackall` with `wiki: "Blackall, Queensland"` (distinct photo key; Lens should give it a proper photo).
Districts: Nominatim returned "Queensland" for ~115 spots, so all new spots use the ABS LGA name (qld-lgas.py).
Kondalilla Falls Circuit (sunshine-coast-hinterland-5) moved ~39 m north of Kondalilla National Park (identical pins).

## Not applied (21 + pending batch)
Pending shard-10 ids skipped as instructed: rainbow-beach-1, whitsundays-10, townsville-1,2,3,5,6,8,9, ingham-1 (in final-spots.json, not applied; townsville-4 and 7 applied; townsville has 1 spot until the batch lands).
- `gold-coast-4` Sea World: cost unverified, not free: adult price (operator blocked; third-party only, not applied): check https://seaworld.com.au/tickets in a real browser
- `gold-coast-5` Warner Bros. Movie World: cost unverified, not free: adult price (operator blocked): check https://movieworld.com.au/tickets in a real browser
- `gold-coast-24` Wet'n'Wild Gold Coast: cost unverified, not free: adult price (operator blocked, no source price): check in a real browser
- `moreton-island-6` Fort Cowan Cowan: review: Only source is Wikipedia; no visitor source or public access found, so it may fail the spot bar (visible remains, public access).
- `sunshine-coast-9` Aussie World: cost unverified, not free: official adult price (ticket page script-rendered): read https://www.aussieworld.com.au/tickets in a real browser
- `sunshine-coast-10` Caloundra Lighthouses: cost unverified, not free: adult entry price amount; 'heritage-listed' not on the council page (left out); tours run only some Saturdays: put in a tip, not the bio
- `sunshine-coast-hinterland-1` Maleny: held (no bio): Maleny: no visitor-source facts on what to see or do; needs a visitor source before a bio can say why to stop
- `rockhampton-1` Capricorn Caves: cost unverified, not free: adult Cathedral Cave Tour price; 'among the largest privately owned' and 'all ages' not re-seen on the operator page
- `gladstone-8` Calliope River Historical Village: cost unverified, not free: Entry price UNVERIFIED: $5 adult from a third-party directory only, undated; official site shows none. Candidate AUD 5 entry, confirm by phone before shipping; 
- `ingham-3` Thorsborne Trail: cost unverified, not free: Permit fee UNVERIFIED: candidate AUD 7.50 per adult per night (needs permit, costBasis permit, costPer Per Night) from a search summary only; QPWS blocked, conf
- `atherton-tablelands-7` Cathedral Fig Tree: held (no bio): Cathedral Fig Tree: needs QPWS/Wikivoyage facts
- `atherton-tablelands-10` Mount Hypipamee National Park: held (no bio): Mount Hypipamee: needs QPWS facts (crater details not yet read)
- `mission-beach-6` Tully Gorge National Park: held (no bio): Tully Gorge National Park: needs QPWS facts; pin is 49.5 km from Mission Beach, near the edge of its span
- `cape-york-6` Moreton Telegraph Station: cost unverified, not free: COST UNRESOLVED: no day-visit price on the operator site; camping is a private charge. Do not record free; owner to decide; Whether non-guests may visit the his
- `winton-1` Waltzing Matilda Centre: cost unverified, not free: adult price (35 per search summary, not confirmed); 2015 fire and 2018 reopening not in bio (researcher only)
- `cactoblastis-memorial-hall` Cactoblastis Memorial Hall: review: owner decision
- `darling-downs-zoo` Darling Downs Zoo: cost unverified, not free: adult admission price (Roller widget is JS-rendered): check in a real browser at https://darlingdownszoo.com.au/ then Tickets
- `lark-quarry-dinosaur-trackways` Lark Quarry Dinosaur Trackways: cost unverified, not free: adult tour price; tour times and booking; whether any QPWS conservation park fee applies
- `cooktown-5` Elim Beach: cost unverified, not free: permit price and per-vehicle or per-person unit; campground closure each November
- `winton-2` Australian Age of Dinosaurs: cost unverified, not free: official adult price (AUD 78 is the low end of an indicative range of tours and entry): no price recorded; opening days not recorded
- `mount-morgan` Mount Morgan: cost unverified, not free: mine tour operator and price; railway museum details; wiki: consider 'Mount Morgan Mine' (not applied)

## Lint left (per qld region, --offline)
- no-ticket: rainbow-beach-5 Wolf Rock, atherton-tablelands-14 Hou Wang Temple, queensland-transport-museum (charge, no verified official link; ticketUrl only if verified).
- thin-destination: townsville (1 spot until the pending batch), winton (3; winton-1 and winton-2 held on price).
- photo-shared (before the Black Stump fix) whitsundays-1 Whitehaven Beach shares its photo with existing great-barrier-reef-2 Whitehaven Beach: a genuine duplicate place across destinations; owner decision (left in).
- Duplicate-flagged pairs applied as separate spots, owner call: gold-coast-8/19 Miami/Nobby, gold-coast-12/11 Kurrawa/Broadbeach, gold-coast-20/18 Tallebudgera/Palm Beach, moreton-island-4 Honeymoon Bay (moreton-island-5 was dropped).
- Not suppressed anything. tsc: 5 errors, all pre-existing (MapScreen), none new.

## Script changes
- scripts/curation/lint-entries.ts: "Surfers Paradise" no longer counts as the marketing word "paradise" (a place name, like "birds of paradise"); whyVisit verb list gained Set, Head, Cool, Trace.
- scripts/coverage-regions.json: 25 destinations and 49 standalone spots added to the qld-* regions (backlog shows no Queensland orphan).
- scripts/curation/why-subjects.json: entries for the 25 destinations (written by apply-destination.py).
- Held for later: spots have no photos set (grey/Wikipedia default); name_fix suggestions not applied; Whitsundays/GBR overlap not rechecked.
