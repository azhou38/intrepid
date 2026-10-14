# Coverage: which destinations and spots belong in the app

How to decide *what* belongs in `src/data/destinations.ts` and `src/data/spots.ts`: which places are destinations and which are spots, where each spot goes (or stands alone), how to find what is missing, how destinations are ranked, and how to verify coordinates. How to write each entry once it is in (names, fields, voice) is in `WRITING.md`; photos are in `IMAGES.md`.

Use this whenever you add a country, region, destination or spot, or are asked for "everything worth visiting" in an area.

## The two levels

- **Destination** — a place you travel *to* and base yourself around for a few hours to a few days: a city or town, a national park, a lake, an island, a stretch of coast, a wine region. It gets its own pin, sheet, ranking, climate and crowd data.
- **Spot** — one thing you go *to see or do* within a destination: an attraction, viewpoint, trail, beach, museum, market, a notable cruise or tour. It gets a pin only once the camera is inside its destination.

A spot belongs to **at most one** destination, and **can stand alone**:

- If a place is worth a trip on its own *and* has enough going on around it to fill a visit, it is a **destination**, and the things around it are its spots.
- If it is a stop within a destination's area that visitors reach from that destination's base, it is a **spot of that destination**.
- If it is a stop with **no appropriate destination to bucket it under**, or **too few neighbouring spots to justify a destination of its own**, it is a **standalone spot**: it sits on the map and in search by itself, with no parent.

Do not force a spot under a destination just because one is nearby. A place with its own identity and its own journey — Glenorchy, an hour from Queenstown at the head of the lake — is separate from Queenstown, not one of its spots: bucketing it there misstates where it is, widens Queenstown's map view, and hides it from anyone not looking at Queenstown. Conversely, do not promote a lone attraction to a destination to give it a home; that needs a description, reasons, tips and best months it cannot honestly support.

Rule of thumb for a destination: a base with roughly **three or more** worthwhile spots around it, or a headline attraction large enough to be a trip in itself (a national park, a major city). That is a guide to the call, not a quota.

### Granularity: what is and isn't a destination

- **Every national park is a destination**, named as the park (`Paparoa National Park`), with the park's gateway villages, walks and sights as its spots. Do not make a destination of a village or feature *inside* a park (Punakaiki, Franz Josef, Fox Glacier): merge them into the park (Paparoa, Westland Tai Poutini). The same goes for any place too small or local to stand beside its neighbours: fold it into the park, coast or region that contains it.
- **Sizable settlements are destinations**, even without a headline attraction, when a guidebook gives them their own chapter or they are a regional hub (Timaru, Blenheim, Invercargill). A city or town people stop in, base from, or travel through earns a pin; do not skip it for lack of a famous sight.
- **No overlapping destinations.** A region and its sub-areas must not both be destinations (Marlborough vs Marlborough Sounds, or a wine region vs its main town): keep the one visitors plan around, and name the other by its town (Blenheim) if it is a separate base. Check a new destination's span against its neighbours'.
- **Towns that don't make the cut are spots**, not omitted: a small town with a few services or a gallery strip (Takaka, Picton, Havelock, Te Anau) is a spot of the destination it serves, or standalone if it has none.

## What qualifies

**The test: would a Lonely Planet (or Rough Guide) chapter for the area give it its own entry or a highlighted mention?** Include what a typical independent traveller would actually plan around. Exclude what only locals use, however pleasant.

Include:
- Places and attractions the major guidebooks feature, and the "top experiences" lists for the country or region.
- Anywhere with its own accommodation base and tourism infrastructure (tours, visitor centre, transport links).
- National parks and Great Walks/long trails, with their best day-sections as spots.
- Natural features, viewpoints, beaches, wildlife encounters, museums, heritage sites, markets, wine/food regions that visitors travel for.
- Official bases and gateways that visitors must pass through (a ferry town, a trailhead village), at a low rank.

Leave out:
- Local parks, reserves, rivers, suburbs and neighbourhoods that are not tourist stops (e.g. a regional park beside a city that no guide mentions).
- Generic "things": chain restaurants, shopping malls, hotels, individual cafés or bars — unless the venue itself is a recognised attraction (a famous brewery tour, a landmark market).
- Anything you cannot confirm exists, is open to visitors, or has a stable name.
- Near-duplicates: do not list a destination as a spot of itself, or the same attraction under two names.

When unsure, leave it out. A tight, credible list beats an exhaustive one; it is easy to add a place later and awkward to defend an empty one.

## Coverage — how many

- **Destinations:** every place that passes the test above for the area asked about, at its natural granularity. A region becomes several destinations (one per base or park), not one big pin and not one per village. Check the list against the guidebook structure: each guide chapter is usually one destination.
- **Spots: no cap, per destination or overall.** Include **every** spot that passes the test above; a great city or flagship park may have dozens. Do not trim a good spot to hit a number, and do not pad a thin one up to one.
- **Order each destination's spots by importance, not geography:** the unmissable headline attraction(s) first, then the best secondary stops, then (where relevant) food, culture and market stops.
- **Where a spot goes:** under the destination visitors reach it from *and* that actually surrounds it (within the destination's map span); otherwise it stands alone. If a destination's span would have to balloon to hold a spot, the spot is not part of that destination.

## Finding what is missing (recall)

Spot and destination lists written from memory miss obvious places: Red Rocks (Wellington), Kapiti Island and Lake Coleridge were all absent. Build and audit coverage from sources, then decide:

1. **Enumerate candidates from sources, not memory:** Wikivoyage's See and Do listings for the region; Wikipedia's tourist-attraction and national-park categories; the Department of Conservation's (or local agency's) popular-places lists; OpenStreetMap attractions and viewpoints that carry a Wikipedia link; Wikipedia page views as the popularity signal.
2. **For every destination ask "what would a guidebook list that we don't?"** Each gap is either proposed or rejected with a written reason. Silence is not allowed.
3. **Decide where each candidate goes**, using the "Where a spot goes" rule above and:
   - inside a destination's map span (about 75% of `defaultZoomSpanKm` from its centre) → a spot of that destination;
   - not within any destination's span and reached on its own (an island, a remote lake, a roadside stop) → a standalone spot;
   - several such places clustered around one base, enough to fill a visit → propose a new destination instead (Kapiti Island plus the Kāpiti Coast around it);
   - otherwise → leave out, and say why.
4. **Benchmark:** a coverage run is only trusted if it proposes Red Rocks as a Wellington spot, Kapiti Island as a standalone spot (or part of a new Kāpiti Coast destination) and Lake Coleridge as a standalone spot. If it does not, fix the process before running it unattended.

Prefer recall at this step; the exclusion test in "What qualifies" is applied when deciding each candidate, not to discard the enumeration unseen.

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
- **"Near" carousel:** a standalone spot's half-screen sheet is a carousel of that spot first, then every other standalone spot within 40 km (`NEAR_RADIUS_KM`), nearest first, up to 10 (`NEAR_MAX_SPOTS`). It is headed **NEAR** over the **nearest destination's name** (by straight-line distance from the spot to each destination's centre), for example "NEAR / Queenstown" for Glenorchy. Destination spots are never in it: they belong to their own destination's carousel. With no other standalone spot nearby it is a single card. Swiping keeps this context and each card gets its map pin; tapping a pin leaves it; closing returns to the standalone spot's own area. There is no "grid view" button, since there is no destination sheet to open a list in. A destination's own spots carousel is headed **SPOTS** over the destination's name.
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

A coordinate in the wrong place (a trailhead in the sea) is easy to write and hard to see. Take spot coordinates from a source that names the entrance, car park, summit or trailhead (the managing agency's page, OpenStreetMap, Wikipedia), **never from memory**: remembered coordinates are typically off by several hundred metres, which on the map is a pin beside the mountain instead of on it, or a beach pin in the sea.

Run `npx tsx scripts/audit-spot-coordinates.ts --country NZ` (needs network) after adding or moving spots. For each spot it reports:
- a point that lies **in water** on the map itself (Mapbox Streets' water layer). Correct for a lake, sound or harbour; wrong for a beach, bay, walkway, cape or anything on land, which should sit on the shore or at the visitor's standing point;
- a point more than `--max-m` (default 250 m) from the spot's **Wikipedia** coordinates or **OpenStreetMap**'s match for its name, with the OSM feature type.

Use the type to judge the flag: a `natural/peak`, `waterway/waterfall`, `man_made/lighthouse`, museum or attraction is a precise point, so move the spot onto it. A `natural/bay` or lake is a centroid in the water, a park or protected area a centroid of its land, and a long trail or glacier a point somewhere along it; keep the spot at its real visitor point (car park, viewpoint, trailhead) instead. Wikipedia coordinates are often rounded to the nearest town. The older `scripts/verify-coordinates.ts` only catches errors over 1 km and open sea, so it misses most of these.

