# Coverage: which destinations and spots belong in the app

How to decide *what* belongs in `src/data/destinations.ts` and `src/data/spots.ts`: which places are destinations and which are spots, where each spot goes (or stands alone), how to find what is missing, how destinations are ranked, and how to verify coordinates. How to write each entry once it is in (names, fields, voice) is in `WRITING.md`; photos are in `IMAGES.md`.

Use this whenever you add a country, region, destination or spot, or are asked for "everything worth visiting" in an area.

## The two levels

- **Destination** — a place you travel *to* and base yourself around for a few hours to a few days: a city or town, a national park, a lake, an island, a stretch of coast, a wine region. It gets its own pin, sheet, ranking, climate and crowd data.
- **Spot** — one *place* you go to see or do something, within a destination: an attraction, viewpoint, trail, beach, museum, market, a landmark. It gets a pin only once the camera is inside its destination. A spot is a place, never a vehicle or an operator (see "A spot is a place" below).

A spot belongs to **at most one** destination, and **can stand alone**:

- If a place is worth a trip on its own *and* has enough going on around it to fill a visit, it is a **destination**, and the things around it are its spots.
- If it is a stop within a destination's area that visitors reach from that destination's base, it is a **spot of that destination**.
- If it is a stop with **no appropriate destination to bucket it under**, or **too few neighbouring spots to justify a destination of its own**, it is a **standalone spot**: it sits on the map and in search by itself, with no parent.

A standalone spot is as much a part of the app as a destination's spot, and is found, judged and kept on exactly the same terms (see "Finding what is missing"). Do not force a spot under a destination just because one is nearby. A place with its own identity and its own journey — Glenorchy, an hour from Queenstown at the head of the lake — is separate from Queenstown, not one of its spots: bucketing it there misstates where it is, widens Queenstown's map view, and hides it from anyone not looking at Queenstown. Conversely, do not promote a lone attraction to a destination to give it a home; that needs a description, reasons, tips and best months it cannot honestly support.

Rule of thumb for a destination: a base with roughly **three or more** worthwhile spots around it, or a headline attraction large enough to be a trip in itself (a national park, a major city). That is a guide to the call, not a quota, and it comes after the name test: the base must be a place travellers actually name (see "A destination is a name travellers actually use" below).

### Granularity: what is and isn't a destination

- **Every national park is a destination**, named as the park (`Paparoa National Park`), with the park's gateway villages, walks and sights as its spots. Do not make a destination of a village or feature *inside* a park (Punakaiki, Franz Josef, Fox Glacier): merge them into the park (Paparoa, Westland Tai Poutini). The same goes for any place too small or local to stand beside its neighbours: fold it into the park, coast or region that contains it.
- **Sizable settlements are destinations**, even without a headline attraction, when a guidebook gives them their own chapter or they are a regional hub (Timaru, Blenheim, Invercargill). A city or town people stop in, base from, or travel through earns a pin; do not skip it for lack of a famous sight.
- **No overlapping destinations.** A region and its sub-areas must not both be destinations (Marlborough vs Marlborough Sounds, or a wine region vs its main town): keep the one visitors plan around, and name the other by its town (Blenheim) if it is a separate base. Check a new destination's span against its neighbours'.
- **A destination is a name travellers actually use.** The test, applied before counting spots: would a traveller say "we're going to X" or search for X, and does a visitor source use it as a heading or brand (a Wikivoyage page or district, a guidebook chapter, a regional tourism brand, a headline attraction named for it)? Port Stephens, Byron Bay and the Blue Mountains pass. A name that only exists as an administrative or geographic label does not: a former or merged council (Pittwater, now the Northern Beaches), a river, estuary or shire, a statistical region, or a grouping coined to bucket a few spots (Macarthur, Hawkesbury). Their spots are **standalone**, or spots of the nearest destination visitors really base from (Palm Beach, Barrenjoey and West Head are Sydney spots, a day trip from the city). If visitors name the place something smaller or different (Palm Beach, the Northern Beaches), call the destination that, or fold it in. Having three or more spots never makes a destination on its own. A proposed destination records its evidence (`name_evidence`: the source and what it calls the place); with none, it is not proposed.
- **Towns that don't make the cut are spots**, not omitted: a small town with a few services or a gallery strip (Takaka, Picton, Havelock, Te Anau) is a spot of the destination it serves, or standalone if it has none.

### A spot is a place, not the way you get there

A cruise, ferry, train, gondola or tour is how you reach a place, and the place is the spot. **TSS Earnslaw is not a spot: Walter Peak High Country Farm is**, and its bio says it is reached by the TSS Earnslaw steamship across Lake Wakatipu (the operator's page goes in `ticketUrl`, the sailing in the bio and hours). The same goes for a sound cruise (the sound), a boat to an island (the island), a water taxi to a sanctuary, a scenic flight (what it flies over).

Keep the ride itself as a spot only when the ride *is* the attraction and there is no distinct place at the end worth naming: a heritage railway with no destination station, a funicular that goes up to nothing but its own café. If there is a named place at the top or the far end (a lookout, a farm, an island), that is the spot, and the vehicle is mentioned in its bio.

### How far a spot reaches: its own place, not its neighbour's

A spot goes under a destination only if visitors reach it *from that destination's base* and it lies *around that base*, not merely beside it on the map. Two common mistakes:

- **A long linear feature belongs to where its visitors reach it.** A beach, river, trail or road that runs for tens of kilometres is placed at its main visitor access point, and it goes under a destination only if that point is inside the destination's span and the destination is where people base themselves for it. **Ninety Mile Beach is not part of Cape Reinga**: it is an 88 km beach reached from Ahipara, Kaitaia and Far North tours, and only its far northern end meets the Te Paki area. It is a standalone spot (or a spot of whichever base visitors use for it), with its coordinates at its main access point, not a spot of Cape Reinga because the two touch.
- **A city's destination holds the city's own attractions; a national park near it is its own destination.** Every national park is a destination (see "Granularity"), so the park's river, walks and huts leave the nearby town. **Many Whanganui spots are not Whanganui's**: Whanganui River and Bridge to Nowhere belong to **Whanganui National Park**, a separate destination, while Whanganui keeps the city's own attractions (Durie Hill Elevator, its galleries and museums). Check each spot of a gateway town: if its visitors are really there for the park, the spot belongs to the park.

## What qualifies

**The test: would a traveller from elsewhere go out of their way for it, can they actually do something there, and does a visitor-oriented source say so?** A candidate must pass all three of these, or be held for review (below).

1. **A visitor-oriented source names it as somewhere to go.** Counted: Wikivoyage's See/Do listings, the managing agency's visitor page (DOC and equivalents), a regional tourism board, a guidebook (Lonely Planet, Rough Guide). **Not counted on their own:** a Wikipedia article, an OpenStreetMap node, a Commons category or a heritage-register entry. Those exist for any building or bend in a road. One counted source is enough for an obvious draw; a marginal one needs two independent counted sources.
2. **A visitor can actually do or see something.** It is open or freely accessible to the public, and gives a reason to stop for roughly half an hour or more (see it, walk it, swim, tour it, eat the thing it is known for). Fail: a building seen only from the pavement (a library, a church, a council or civic building, a hospital), a place that is closed, being restored or has no public access, private land, and a venue that is only a shop, restaurant or office. A heritage building qualifies only if the public can go in, or it is the named stop of a guide's walking route.
3. **It is a distinct draw.** Not a near-duplicate of a spot already in the app, not part of a larger spot (an outlook on the track the app already lists), not a minor memorial or plaque, not a roadside pull-out with a ten-minute look unless a guide singles it out by name.
4. **It is there whenever a visitor arrives.** A spot is a permanent place or a permanent venue, not an occasion. **Not spots:** a festival, carnival, parade or fair; a market that runs only one or two days a week (a Saturday farmers' market); a seasonal or annual event (a summer carnival, a Christmas market, a regatta); a recurring show or concert. They may be mentioned in the destination's description, a "good to know" tip or its best-time text, where timing belongs, but they get no spot. A permanent venue that merely opens seasonally (a ski field, an amusement park, a Great Walk) is still a spot, and so is a market hall that trades every day (La Boqueria, Les Halles, Riverside Market).

Run the friend test last: would you tell a friend flying in for four days to go there? If the honest answer is "only if they are nearby anyway", it is marginal.

**Marginal cases are not auto-added.** A candidate that passes only on one counted source and a short visit, or that a reviewer would argue either way, goes in a "review" list in the pull request (with its sources and the case for and against) and is added only once the owner approves. The bar stays forgiving for strong places and strict for borderline ones. Rarely visited places, places only locals use, near-duplicates and an operator or vehicle in place of its destination always fail.

The bar is deliberately a little forgiving about *what kind* of place counts. Examples of New Zealand places that clear it and must be present: **Red Rocks** (Wellington), **Kapiti Island**, **Sumner Beach** and **Godley Head** (Christchurch), **Birdlings Flat**, **Lyttelton**, **Paradise** (near Glenorchy), **Hump Ridge Track**, **St Kilda Beach** (Dunedin), and quirky roadside icons such as the **Ohakune Carrot**. **Must be rejected (negative benchmarks):** a once-a-week market such as Nelson Market or the Matakana Village Farmers Market (both removed), Queen Mary Hospital (Hanmer Springs: not open to visitors, exterior only), Tūranga (Christchurch library: a civic building), the Bridge of Remembrance (a minor memorial), a local church or community hall, and an ordinary suburban park.

Include:
- Places and attractions the major guidebooks feature, and the "top experiences" lists for the country or region, **and the second tier**: the beaches, bays, headlands, walks, harbour towns and small villages that a guide recommends as a stop (Sumner, St Kilda, Godley Head, Lyttelton, Paradise, Birdlings Flat).
- **Quirky landmarks and roadside icons** that travellers stop for and photograph (the Ohakune Carrot, giant sculptures, famous signposts): they are spots, with a short bio saying what they are.
- Multi-day and day walks outside the Great Walks that a guide or DOC promotes (Hump Ridge Track), and island and wildlife sanctuaries (Kapiti Island).
- Anywhere with its own accommodation base and tourism infrastructure (tours, visitor centre, transport links).
- National parks and Great Walks/long trails, with their best day-sections as spots.
- Natural features, viewpoints, beaches, wildlife encounters, museums, heritage sites, markets, wine/food regions that visitors travel for.
- Official bases and gateways that visitors must pass through (a ferry town, a trailhead village), at a low rank.

Leave out:
- Local parks, reserves, rivers, suburbs and neighbourhoods that are not tourist stops (e.g. a regional park beside a city that no guide mentions).
- Generic "things": chain restaurants, shopping malls, hotels, individual cafés or bars — unless the venue itself is a recognised attraction (a famous brewery tour, a landmark market).
- Anything you cannot confirm exists, is open to visitors, or has a stable name.
- Near-duplicates: do not list a destination as a spot of itself, or the same attraction under two names.

When unsure, apply the three-part test above. A place that passes all three is added; a place that fails any one is left out, or held for review if it is marginal. A credible list beats an exhaustive one, but an *incomplete* one is the bigger failure: missing Red Rocks, Sumner or Lyttelton makes the app look thin, whereas a modest extra stop costs little.

## Coverage — how many

- **Destinations:** every place that passes the test above for the area asked about, at its natural granularity. A region becomes several destinations (one per base or park), not one big pin and not one per village. Check the list against the guidebook structure: each guide chapter is usually one destination.
- **Spots: no cap, per destination or overall.** Include **every** spot that passes the test above; a great city or flagship park may have dozens. Do not trim a good spot to hit a number, and do not pad a thin one up to one.
- **Order each destination's spots by importance, not geography:** the unmissable headline attraction(s) first, then the best secondary stops, then (where relevant) food, culture and market stops.
- **Where a spot goes:** under the destination visitors reach it from *and* that actually surrounds it (within the destination's map span); otherwise it stands alone. If a destination's span would have to balloon to hold a spot, the spot is not part of that destination. Placement is decided **after** inclusion and never decides it.

## Finding what is missing (recall)

Spot and destination lists written from memory miss obvious places: Red Rocks (Wellington), Kapiti Island and Lake Coleridge were all absent. And a search organised **by destination** finds what is inside destinations and misses what lies between them: after the New Zealand run, 356 of 364 spots sat under a destination and 8 stood alone, because every destination got its own enumeration, recall check and skeptic while the whole country's in-between land got one pass. **A place's chance of being in the app must not depend on whether a destination happens to surround it.** So coverage is found by region, every candidate is judged on the same bar and the same score before anyone decides where it goes, and each run reports the strongest places it left out.

### The unit is a region, not a destination

A coverage run covers one **region**: the country's own first-level tourism or administrative regions, listed in `scripts/coverage-regions.json` (for New Zealand, the regional-council regions with Nelson and Tasman as one, plus the Chatham Islands). A region pass covers **all of the region's land**, the destinations in it and everything between them, with the same effort. A country's coverage is complete only when every region has had a region pass; `scripts/curation-backlog.ts` lists the regions that have not. A pass for a single destination is still allowed for a quick fix, but it does not count as coverage of its region, and its candidates are scored and judged exactly as below.

### The steps

1. **Enumerate the region from sources, not memory**, with no regard to where our destinations are: Wikivoyage's See and Do listings for the region and every town in it; Wikipedia's tourist-attraction, beach, walk and national-park categories for the region; the Department of Conservation's (or the local agency's) places to go in the region; the regional tourism board's highlights; OpenStreetMap attractions and viewpoints with a Wikipedia link anywhere in the region. List every place that at least one source names as somewhere to go.
2. **Score every candidate the same way**, recording on it: `views`, its English Wikipedia article's page views over the last 12 months (0 with no article; a title that only redirects to a broader article counts as 0, since the views are the broader place's); and `counted_sources`, how many independent **counted** sources (see "What qualifies") name it. The score is what ranks candidates against each other across the whole region; it does not decide inclusion on its own.
3. **Judge inclusion blind to placement.** Every candidate passes, fails or goes to review on "What qualifies" alone, and the judge is **not told** whether it lies inside a destination's span, nor which destination is near it. "There is no destination for it", "it is far from everything" and "the destination already has enough spots" are never reasons to leave a place out; "it is inside a well-covered destination" is never a reason to keep one. Every candidate gets a written verdict; silence is not allowed. Also re-judge the region's **existing** spots on the same bar, so an older weak spot (one that would now go to review) is flagged rather than grandfathered.
4. **Only then decide where each kept candidate goes**, using "Where a spot goes" above:
   - inside a destination's map span (about 75% of `defaultZoomSpanKm` from its centre) and reached from that base → a spot of that destination;
   - not within any destination's span and reached on its own (an island, a remote lake, a roadside stop, a track) → a **standalone spot**, a first-class outcome and not a fallback;
   - several kept places clustered around one base, enough to fill a visit → propose a new destination only if the base passes the name test (Kapiti Island plus the Kāpiti Coast around it);
   - a kept place is never dropped at this step for want of a home: if none of the above fits, it is a standalone spot.
5. **Fairness check before the run is accepted.** The run's report lists, for the region: the kept spots with the lowest scores, and every candidate left out or sent to review whose score is higher than the lowest-scoring kept spot, each with its reason. It also reports how many kept candidates were inside destinations and how many were standalone, and the strongest candidates outside every destination's span. A strong outsider left out without a concrete reason from "What qualifies" means the run is redone, not accepted.
6. **Benchmark:** a coverage run is only trusted if it proposes, at least, Red Rocks as a Wellington spot; Kapiti Island as a standalone spot (or part of a new Kāpiti Coast destination); Lake Coleridge as a standalone spot; Sumner Beach, Godley Head and Lyttelton as Christchurch spots; Birdlings Flat as a spot or standalone spot; Paradise as a Glenorchy-area spot; Hump Ridge Track; St Kilda Beach as a Dunedin spot; the Ohakune Carrot as a spot; and Ninety Mile Beach as its own standalone spot, *not* under Cape Reinga. It must also not propose TSS Earnslaw as a spot (Walter Peak High Country Farm instead). It must reject the negative benchmarks in "What qualifies" (Queen Mary Hospital, Tūranga, the Bridge of Remembrance), and it must send a gateway village whose draw is the journey beyond it (Pipiriki, for the Whanganui River) to review rather than keep it outright. If it does not, fix the process before running it unattended.
7. **Photo, writing and facts before it goes in.** A placement entry is a draft: the spot goes through Pipeline C research (hours, cost or `free: true`, and the official site) before it is applied, the same as a new destination's spots (`PIPELINES.md` → Pipeline C). Fields the sources did not give stay empty for research; never a placeholder such as "Hours vary; check the operator". A missing photo never keeps a spot or destination out (IMAGES.md; if Commons has none, source one elsewhere per "When Commons has no suitable photo"). If no passing photo can be found in any tier, the spot or destination is still added, and the run ends by asking the owner to supply a photo for it (see IMAGES.md → "Photos still missing"). This applies to standalone and destination spots alike, and to destination headers and why-visit photos: nothing is held back for want of a photo. A proposed **new destination** is only a proposal: it needs its description, two to four reasons (by popularity) with photos, tips, best months and a header (`WRITING.md`, Pipeline C), so a coverage run lists it for the owner and does not add it. Existing spots that a run finds misplaced (a vehicle, the wrong destination, a long feature under a neighbour) are fixed by hand and logged in the pull request.

Prefer recall at the enumeration step; the exclusion test in "What qualifies" is applied when judging each candidate, not to discard the enumeration unseen.

## Ranking destinations (`rank`)

Prominence tier; it decides what shows when space is limited (pin plans, Near You). Be honest — do not inflate.

| Rank | Meaning | Examples |
|---|---|---|
| 1 | World-famous; on most itineraries for the country | Paris, Queenstown, Fiordland |
| 2 | A country highlight a guidebook gives top billing | Christchurch, Lake Tekapo, Abel Tasman |
| 3 | Regional favourite, worth planning around | Dunedin, The Catlins, Nelson |
| 4 | Worth a detour if you are nearby | Hanmer Springs, Golden Bay |
| 5 | Local base or gateway | Greymouth, Invercargill |

A country with 20+ destinations should have only a handful at rank 1. A guidebook's "top experiences" map to ranks 1–2.

## Standalone spots in the app

A spot with no `destinationId` is standalone, and the app supports it end to end. Because a destination normally supplies a spot's place context, a standalone spot carries its own — **all four are required**:

```ts
{ id: 'glenorchy', country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', timezone: 'Pacific/Auckland',
  name: 'Glenorchy', icon: '🏔️', coordinates: { … }, category: 'nature', bio: '…', hours: …, … }
```

Put standalone spots in the "Standalone spots" section at the end of `src/data/spots.ts`. Their id is a unique slug (it must not collide with any destination or spot id), and, like every id, is never changed once shipped.

How they behave:
- **Map:** the pin appears once the camera is zoomed in to about a 40 km view (`STANDALONE_SPOT_SPAN_KM`), the same handoff a destination's spots use. Nothing is selected as a destination — a standalone spot opened from a destination's context goes back to that destination, otherwise closing it returns to a ~40 km view of its own area. The map's breadcrumb names the spot under its country.
- **Spots carousel:** a standalone spot's half-screen sheet is a carousel of that spot first, then **every other spot in the same second-level administrative division** (a New Zealand district or city council area such as "Selwyn District", a county elsewhere; `src/data/spotDistricts.json`, from OpenStreetMap), nearest first, destination spots included. It is headed **SPOTS** over the division's name. Only the spot and its 12 nearest neighbours get a full photo pin while it is open; each other card gets its pin when it is selected. A spot with no recorded division falls back to the standalone spots within 40 km (`NEAR_RADIUS_KM`), headed by the nearest destination. Swiping keeps this context and each card gets its map pin; tapping a pin leaves it; closing returns to the standalone spot's own area. There is no "grid view" button, since there is no destination sheet to open a list in. A destination's own spots carousel is headed **SPOTS** over the destination's name. **Every new spot needs a division:** run `python3 scripts/curation/build-spot-districts.py --only <ids>` (it caches into `spotDistricts.json`); `lint-entries.ts` flags a spot without one.
- **Search:** found by name, labelled with its country instead of a destination.
- **Visited:** visiting it marks its **country** visited (there is no destination to carry it up); un-visiting it never un-visits the country, and removing the country removes it. The country sheet's spot count includes it.
- **Hours:** read in its own `timezone`.

Never read `spot.destinationId` directly: use `spotDestination`, `spotCountryCode`, `spotCountry`, `spotContinent` and `spotTimezone` from `src/data/spots.ts`, which handle both kinds.

Known limits: a country needs at least one destination to get a map pill and a country sheet (a country with only standalone spots has neither); a standalone spot cannot be ticked in a country trip (that selector lists destinations); and it has no destination sheet, so no "My Visit" grouping above it.

## New country or region checklist

When the area's country is not yet in the app, also update (the data alone is not enough):

1. `src/utils/countryBounds.ts` — `BOUNDS` (bounding box), `POPULARITY` (tourism-prominence order for pin priority), and `LABEL_POINTS` when the box centre falls off the land (elongated or island countries).
2. `src/components/Map/CountrySheet.tsx` — `COUNTRY_FACTS` (population, languages, currency, area, capital).
3. `src/data/countries.ts` already lists every country; nothing to add. `src/utils/geocode.ts` already maps continents.
4. Make sure the destinations' `countryCode`s match, and that destinations in the area are grouped under that country.

## Verifying coordinates

A coordinate in the wrong place (a trailhead in the sea) is easy to write and hard to see. Take spot coordinates from a source that names the entrance, car park, summit or trailhead (the managing agency's page, OpenStreetMap, Wikipedia), **never from memory**, and never from a page about a larger place: a Wikivoyage district or town page (or its listing's geo tag when the listing has none of its own) gives the town's centre, not the attraction's. Cronulla Beach shipped in Cronulla's town centre, 450 m from the sand, from the Wikivoyage "Sydney/Cronulla" page. For a beach, take OpenStreetMap's `natural/beach` feature or the Wikipedia article of the beach itself. remembered coordinates are typically off by several hundred metres, which on the map is a pin beside the mountain instead of on it, or a beach pin in the sea.

Run `npx tsx scripts/audit-spot-coordinates.ts --country NZ` (needs network) after adding or moving spots. For each spot it reports:
- a point that lies **in water** on the map itself (Mapbox Streets' water layer). Correct for a lake, sound or harbour; wrong for a beach, bay, walkway, cape or anything on land, which should sit on the shore or at the visitor's standing point;
- a point more than `--max-m` (default 250 m) from the spot's **Wikipedia** coordinates or **OpenStreetMap**'s match for its name, with the OSM feature type.

**Every new pin is resolved from a map feature, with two sources where one exists.** Run `python3 scripts/curation/resolve-pin.py --name "<spot>" --category <category> --lat <hint> --lon <hint> [--wiki "<title>"]` for every spot you add or move. It returns OpenStreetMap features of the right type whose distinctive name word matches (the peak, viewpoint, beach, waterfall, trailhead or building itself), the Wikipedia coordinates and the median of geotagged Commons files, and a confidence. Use only a **HIGH** point (two independent sources within 100 m) or a **MEDIUM** one (one precise OSM feature of the right type); on **LOW** do not guess: take the managing agency's trailhead or car park point and say so in the entry's notes, or leave the spot for the owner. A coordinate is never taken from memory, never rounded (three decimals or fewer is a memory pin: `lint-entries.ts` flags it as `pin` and `apply-region.py` refuses to add such a spot), never taken from a town or district page (it is the town's point), and never taken from a name search that matched a generic word ("Fishing Rock" is not "Paritutu Rock"; Sulphur Bay matched Vanuatu). Record the source and feature type (`coordinates_source`) in the entry. The audit tolerance is **100 m**, not 250: Paritutu Rock (1.5 km) and Pouakai Tarns (5 km) shipped wrong because the first load wrote pins from memory and the later audit's tolerance and manual review let neighbours through.

**Trails and hikes are pinned at the middle of the route, not the trailhead.** A track, walk, trail, circuit or crossing gets the point halfway along its length (`resolve-pin.py` takes the midpoint of the OpenStreetMap way or hiking route that matches its name, and reports its length), so the pin sits on the route the visitor walks and the map shows where it goes. If the route is not in OpenStreetMap, or it is a loop whose halfway point is not on the path, take the agency's route map and say so. A multi-day track is pinned at the centre of its whole length. (Spots written before this rule keep their trailhead pins until they are revisited.)

**A hill, peak, lookout or summit must be pinned ON the hill.** The pin is the viewpoint, summit marker or car park at the foot of the named feature, never the town, the suburb or a point on the plain beside it: Napier's Bluff Hill Lookout shipped 1.5 km west of the hill, at 8 m elevation on the flat, because the source named the town. Take the point from an OpenStreetMap `natural=peak` or `tourism=viewpoint` node whose name matches (or the agency's trailhead for a summit walk).

**Every flag gets a decision before the run is accepted**: move the spot, or record why its point is right (a long feature's visitor point, a centroid reference); an unread flag is how Cronulla Beach kept its town-centre pin. Use the type to judge the flag: a `natural/peak`, `waterway/waterfall`, `man_made/lighthouse`, museum or attraction is a precise point, so move the spot onto it. A `natural/bay` or lake is a centroid in the water, a park or protected area a centroid of its land, and a long trail or glacier a point somewhere along it; keep the spot at its real visitor point (car park, viewpoint, trailhead) instead. Wikipedia coordinates are often rounded to the nearest town. The older `scripts/verify-coordinates.ts` only catches errors over 1 km and open sea, so it misses most of these.

