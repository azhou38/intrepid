# WA run tally (read out in the final report)

## Left out / not added
- Bunda Cliffs: in South Australia, outside the run.
- Pilbara recall: Pretty Pool, Cleaverville Beach, Miaree Pool, Crossing Pool (closed to campers since 2013), Whim Creek (hotel only): no reachable visitor source found.
## Added but weak
## Needs the owner
- Eyre Bird Observatory (nullarbor-plain-3): temporarily closed (health and safety works), no reopening date; written in full: ship or hold?
- Nullarbor Plain timezone: Eucla and roadhouses east of Caiguna keep Central Western time (Australia/Eucla, +45 min); written as Australia/Perth.
- Email in request headers: resolve-pin.py, build-spot-districts.py and my own lookups send alexzhou38@gmail.com in the User-Agent to Nominatim/Overpass (Nominatim's policy asks for contact info); remove it from the scripts?
- Penguin Island (perth-47): written, but its only public ferry is currently suspended (jetty sand build-up); ship it or hold it?
- Swanbourne Beach (perth-44): written as the clothing-optional stretch; the main patrolled beach is the alternative.
- Rottnest Island: only four spots for a rank-2 destination; Pinky Beach, Parakeet Bay, Little Salmon Bay, Wadjemup Museum and the Quod were never enumerated.
- Pilbara: Millstream Chichester NP becomes a destination candidate if any of its review entries (Cliff Lookout, Mount Herbert, Snappy Gum Drive) is approved.
- Boundary reconciliation: six places rejected by one region as another's were moved to their council area's region and judged there: Fernhook Falls, Mandalay Beach, Mount Frankland NP, Peppermint Grove Beach (South West); Sunset Beach, Geraldton (Coral Coast); Yongernow Malleefowl Centre (Great Southern).
- Filter overrides by me: Wittenoom (Pilbara) moved from auto-keep to the judge (asbestos ghost town, state warns against visiting).
- Filter overrides by me (moved from auto-reject to the judge): Sacred Heart Church, Beagle Bay (church rule; visitors see the mother-of-pearl altar); Merredin WWII Army Hospital Sites (hospital rule; a heritage site).
## Photos still missing
## Not verified
- Perth placement: the Gravity Discovery Centre (Gingin) was never enumerated; Connor's Mill's $3 price may be stale; WA Museum Boola Bardip's Wikipedia title to confirm; Zig Zag Scenic Drive named from OSM (Wikivoyage calls it the Kalamunda Zig Zag).
- Pilbara placement: Marble Bar Pool (the town's namesake jasper bar) was never enumerated; Spoil Bank may be renamed Spoilbank Marina; Roebourne's Old Gaol Museum reported closed (left out of its bio).
- Wrong enumerator data to fix at Pins/scoring: London Bridge, Sandstone (England's coordinates and views); Big Lobster, Coral Coast (South Australia's views); Nanny Goat Hill (Ottawa coordinates, rejected anyway); Smiths Beach (Yallingup's town point); Museum of the Great Southern (Perth WA Museum point).
- Brierley Jigsaw Gallery, Bridgetown: a permanent stop found behind the Puzzletown festival listing; not enumerated or judged.
- Waterfall Beach (William Bay NP, Denmark): DBCA site the Great Southern enumeration missed; not judged.
- Perth: rottnestisland.com and sealink.com.au block scripts; Rottnest spots' second sources were operator pages: check the island authority's pages in the browser at Quill. Wrong enumerator coordinates on South Beach (Miami), Cathedral Rocks (Antarctica), Henley Park (England): re-pin. Houghtons Wines sold in 2019 (now Nikola Estate): not judged under its current name.
- Golden Outback: wrong enumerator coordinates to replace at Pins: Museum of the Goldfields (Perth WA Museum point), Esperance Bird and Animal Park (Gibson locality), Hannans North Tourist Mine (Hall of Fame point).
- Great Southern proposer: Sepucralis Hill Lookout and the Mount Barren walk (Fitzgerald River NP) were rejected by the Golden Outback judge as outside its region; make sure the Great Southern covers them.
- South West (Atlas): australiassouthwest.com blocks scripts (403); its 178 attraction listings were read in the in-app browser through the site's own listings API and passed to the South West and Great Southern enumerators (curation/wa/sources/).
- Perth (Atlas): first pass missed Perth itself, Elizabeth Quay, Matilda Bay, Heirisson Island, London Court, Araluen, Leighton Beach and others; added in a recall pass (252 candidates).
- Kimberley (Atlas): 53 candidates without coordinates (OSM down during enumeration); area-level Wikipedia pins for Cape Leveque, Horizontal Falls, Buccaneer Archipelago, Montgomery Reef.
- Golden Outback (Atlas): 120 candidates without coordinates; Wheatbelt and Murchison parks only partly covered (the Golden Outback site's search pages render in JavaScript).
- Pilbara (Atlas): no coordinates yet for Mackerel Islands, Onslow Point Lookout, Six Mile Creek, Tien Tsin Lookout; approximate enumerator pins for Hancock Gorge, Gorge Rim Walk, North Pole, Doolena Gorge, Snappy Gum Drive, Cemetery Beach, Staircase to the Moon (all re-pinned by resolve-pin at the Pins stage if kept).

## Quill: coral-coast 2 (Kalbarri NP, Geraldton) and kimberley 2 (Kununurra, Wyndham, Purnululu)
- Unverified: Geraldton Regional Art Gallery admission (free per third-party listings; "Entry: Donation" on a Visit Geraldton map); Greenough opening time (National Trust gives only "last entry 3pm"; a snippet says 10–3, last entry 2pm); Kalbarri park sites' hours (DBCA publishes none, "Open 24 hours" assumed); Kalbarri coastal sites' fee ($17/vehicle recorded; Wikivoyage 2022 said the coastal lookouts were free); HMAS Sydney II Memorial tour price; St Francis Xavier Cathedral closing (5pm 2026 sheet vs 6pm 2025); Wyndham fuel-hours tip (Wikivoyage, Jul 2024); Mirima "Open 24 hours"; Purnululu season "Apr–Nov, weather permitting" approximate; Kimberley visit-time ranges estimated.
- Pins to check: Kungkalanayi Lookout pinned at the viewpoint OSM names "Walanginjdji Sunset Lookout" (top of the "Kungkalanayi Lookout Trail"; matches DBCA's 500 m walk).
- Links: geraldtondiocese.org.au serves gambling spam, not linked (cathedral links to the Monsignor Hawes Heritage Centre tours page).
- Owner's call: Wyndham order (Prison Tree above The Grotto?); Purnululu reason "Wander among the beehive domes" refers to the Domes walk, which is not its own spot.

## Lens notes
- blackwood-valley why3 "Browse Bridgetown's studios and galleries": no photo in any tier (Commons, Openverse, Southern Forests & Valleys, Blackwood River Arts Trail, Australia's South West in browser). To reword after the wave (candidates: the heritage main street, e.g. "Bridgetown Hotel, January 2022 03.jpg", or the railway station) and search/judge the new photo.
- Commons API answers 429 to this machine while nine search agents run: no manual Commons searches until the wave ends.
- cape-le-grand why1 reworded "See kangaroos on the sand at Lucky Bay" -> "Swim off Lucky Bay's white sand" (no photo of Lucky Bay's kangaroos in any tier); first-judge pick by the orchestrator: "Lucky Bay, Cape Le Grand National Park, January 2025 05.jpg".
- hyden category city -> landmark (visitors come for Wave Rock; no town view passes the header checks).
- Official photos, permission not confirmed (copyright risk, owner to seek permission): Kalgoorlie-Boulder why2 (WA Museum, Museum of the Goldfields gold display, visit.museum.wa.gov.au/goldfields); Hyden why3 Lake Magic (Wave Rock Resort, waverock.com.au/project/lake-magic/; Commons fallback "Lake Magic, Hyden, Western Australia, October 2020 01.jpg" with a daylight reason).
- Weak-ish why-visit fits: Esperance why1 (the drive's road through heath, no sea in frame); Cape Le Grand why2 (the peak, not the summit view); why3 (Thistle Cove headland, not named as the trail).
- dest-1: Ningaloo why2 is a Flickr photo (TravelingOtter, CC BY-SA 2.0, flickr.com/photos/14146962@N07/4495577616), external photo entry needed at apply. Commons "Whale shark.JPG" is in the Ningaloo category but is from South Ari (Maldives): never use it. Weak fits: Jurien Bay why2 shows the track up Mount Lesueur, not the ocean view; Shark Bay header and why4 share one file (allowed).
- Nambung why3 (Hangover Bay snorkel), why4 (spring heath) and Jurien Bay why3 (North Head radar bunkers): nothing on Commons/Openverse; tiers 2-4 + browser search running.
- dest-7: reworded margaret-river-region why2 -> "Explore the region's limestone show caves" and southern-forests why2 -> "See Beedelup Falls in the karri forest". Bunbury why1 (dolphin cruise, Koombana Bay): no photo in any tier (Dolphin Discovery Centre's own photos are 900 px): owner photo or reword. Collie header is a heritage streetscape under overcast sky (no skyline/waterfront on Commons): weak. Southern Forests why3 Yeagarup Dunes is an official Australia's South West photo (permission not confirmed) and a low drone view. Bunbury why3 and Southern Forests why2 picks are Flickr (johncooke CC BY-SA 2.0; Brian Ralphs CC BY 2.0): download with a browser.
- Rewords/drops (no honest photo for the original): nambung why3 -> "Swim in the clear water of Hangover Bay"; nambung why4 "See the heath in spring flower" DROPPED (no photo in any tier; Nambung keeps 3 reasons though rank 2); walpole why1 -> "Walk among the tingle treetops" (no numbers), why2 -> "Walk through fire-hollowed giant tingles", why3 -> "Walk down to Conspicuous Cliff's surf beach"; fitzgerald why3 -> "Visit the deep valley of Hamersley Inlet"; blackwood-valley why3 -> "Stroll Bridgetown's heritage main street".
- Permission not confirmed: Nambung why3 (DBCA official, Bronwyn Wells), Jurien Bay why3 (ExplorOz user photo by John P51 — blog tier). Denmark header weak (river mouth, no town buildings). Fitzgerald why1 whale is a dot at card size.
- Denmark why3 "Surf at Ocean Beach": no Commons photo; browser tier pending.
- Denmark why3 Ocean Beach: Tourism WA official photo (ATDW listing), permission not confirmed; subject point crops out a couple on the boardwalk.
- scripts/openverse-search.py also puts the user's email in its User-Agent (like resolve-pin.py): owner to decide whether to strip it.
- fitzgerald why1 reworded -> "Look across the bay from Point Ann" (whales only a dot); its photo is also the header.
- kununurra why3 -> "Look over Kununurra from Kelly's Knob"; wyndham why1 -> "Look over the gulf from Five Rivers Lookout" (no sunset photos). Kununurra header is Lake Kununurra (no ground-level town view on Commons): weak.
- mandurah why1 -> "See wild dolphins in Mandurah's waterways"; perth-hills why1 -> "Walk to Serpentine Falls". Official photos, permission not confirmed: Perth why4 Swan Valley (swanvalley.com.au, Upper Reach winery), Mandurah header (Visit Mandurah, low drone). Rottnest why4 seals: Cathedral Rocks location from GPS only (40 m from the West End viewpoint).
- Port Hedland: both reasons (Staircase to the Moon; flatback turtles at Cemetery Beach) have no honest photo in any tier (Commons Staircase photo is Broome; turtle photo is near Exmouth): reasons being rewritten around photos found. Karratha why2 (Dampier Archipelago boat) is a Clearwater Tours official photo, permission not confirmed. Weak: Karratha header (construction in foreground), Red Dog (2003, 1280 px exactly, signboards).
- port-hedland reasons -> "Watch ore carriers in Port Hedland harbour", "See old ore trains at the Don Rhodes Museum".
- Collie header: NO PHOTO in any tier (no town-in-landscape view exists; Collie is on flat ground with no lookout over town). Collie added with --allow-no-header; owner to supply a header. Fallback streetscapes: Collie River Valley "Heritage-Trail_Throssell-St..." (official) or Commons "Intersection of Forrest and Steere Street, Collie...January 2026.jpg".
- Official photos, permission not confirmed: Southern Forests why3 Yeagarup walkers (Pemberton Discovery Tours via DBCA), Bunbury why1 dolphins (Dolphin Discovery Centre), Kununurra header (Tourism WA/ATDW, Kelly's Knob listing).
- WA spot divisions: Nominatim has no WA councils; new scripts/curation/build-wa-lgas.py uses ABS LGA boundaries + official council names.
- scripts/curation/build-spot-districts.py also sends the user's email in its User-Agent; this run used a scratch copy without it.
- kalbarri why3 -> "Walk the red clifftops of the Kalbarri coast" (no whale photo). Derby why2 Mowanjum is a Tourism WA/ATDW photo (permission not confirmed). Port Hedland header: ANW official low drone (CJ Maddock), marginal.
- lint: no-ticket for spots with no official site found: perth-hills-13 Cohunu Koala Park (old domain now an unrelated blog), port-hedland-3 Dalgety House Museum (volunteer society, no site), gibb-river-road-4 Manning Gorge (fee paid at Mt Barnett Roadhouse, no site), sacred-heart-church-beagle-bay (community entry fee, no site).
- lint: derby thin-destination: 3 spots at rank 5 after Wharfinger's House Museum was held (no price): owner to decide (keep Derby as approved, or make its spots standalone).
- lint: photo-shared (name collisions with other countries' spots): albany-5 Little Beach (little-beach-bouddi), geraldton-7 The Esplanade (palmerston-north-2), jurien-bay-4 North Head (auckland-22), broome-3 Town Beach (town-beach): fixed in the spot Lens pass.
- New: apply-destination.py --allow-missing-why (grey card for a strong reason with no photo); not applied retroactively to this run's rewords (owner, 2026-10-22).

## Why-visit photos lacking (for the closing alert): reasons reworded or dropped for want of a photo
- Kalbarri National Park: why3 reworded from "Watch for whales from the sea cliffs": no photo of whales off Kalbarri in any tier searched (Lens dest-8)
- Nambung National Park: why3 reworded from "Snorkel at Hangover Bay": the only passing photo (DBCA) shows the bay with no snorkellers
- Nambung National Park: why4 "See the heath in spring flower" dropped: no photo of the heath in flower in any tier (Commons, Openverse, DBCA, Tourism WA, Coral Coast, blogs, Flickr); dropped rather than padded
- Cape Le Grand National Park: why1 reworded from "See kangaroos on the sand at Lucky Bay": no photo of kangaroos at Lucky Bay in any tier (Lens dest-2).
- Hyden: why3 reworded from "Watch Lake Magic change colour at sunset": the only sunset photo is watermarked; the Commons daylight photo shows the lake's pale water and gypsum shore (Lens dest-2 tie-break).
- Fitzgerald River National Park: why3 reworded from "Paddle Hamersley Inlet among black swans": no photo with a paddler or the swans
- Fitzgerald River National Park: why1 reworded from "Watch southern right whales at Point Ann": the only whale photo at Point Ann shows them as a dot (both Lens judges)
- Walpole Wilderness: why2 reworded from "See the fire-hollowed Giant Tingle Tree": the photo cannot be proven to be the named Giant Tingle Tree
- Walpole Wilderness: why3 reworded from "Watch for whales from Conspicuous Cliff": no photo of whales from the lookout
- Kununurra: why3 reworded from "Watch sunset from Kelly's Knob": no sunset photo from the Knob in any source searched
- Kununurra: why3 reworded from "Look over Kununurra from Kelly's Knob": the Knob photo looks east over Mirima, not the town (Lens dest-9)
- Wyndham: why1 reworded from "Watch sunset from Five Rivers Lookout": no sunset photo from the lookout on Commons
- Mandurah: why1 reworded from "Cruise the estuary to see dolphins": no photo of a cruise boat with dolphins passes (Commons, Visit Mandurah)
- Perth Hills: why1 reworded from "See Serpentine Falls after winter rain": the only passing photo is a summer flow, not after winter rain
- Port Hedland: whyVisit reworded from ['See the Staircase to the Moon', 'See flatback turtles at Cemetery Beach']: no honest photo of either (Staircase photos are of Broome; the only flatback turtle photo is near Exmouth); the new reasons match Commons photos (Lens dest-6)
- Blackwood Valley: why3 reworded from "Browse Bridgetown's studios and galleries": no photo of a Bridgetown studio or gallery in any tier
- Margaret River Region: why2 reworded from "Explore show caves beneath the karri forest": the passing cave photo (Ngilgi) is under coastal heath, not karri (Lens dest-7)
- Southern Forests: why2 reworded from "Cross Beedelup Falls' suspension bridge": no photo shows the suspension bridge as its subject (Lens dest-7)
- scripts/curation/photo-prove.py also sends the user's email in its User-Agent; scratch copy used.

## Spot photos still missing (official photo found but blocked to scripts: owner can save these)
- spot:southern-forests-13: https://australiassouthwest.com/wp-content/uploads/2023/04/019_20171126_ASW_Northcliffe-web.jpg
- spot:munda-biddi-trail: https://australiassouthwest.com/wp-content/uploads/2023/03/21_20181112_ASW_Wellington-National-Forest-Bikings-and-Honeymoons-Pool-web.jpg
- spot:ferguson-valley: https://australiassouthwest.com/wp-content/uploads/2022/07/73_20181113_ASW_Generic-Ferguson-Valley-Scenes-web.jpg
- spot:collie-3: https://australiassouthwest.com/wp-content/uploads/2023/04/ASW_Collie_Black-Diamond-Lake-web.jpg
- spot:collie-6: https://australiassouthwest.com/wp-content/uploads/2024/10/1-contain-1040x860-1.jpg
- southern-forests-8 Big Brook Dam, harvey, boola-bidi-dreaming-centre: no passing photo in any tier (South West search)
