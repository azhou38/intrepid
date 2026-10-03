# Choosing destinations and spots

How to decide *what* belongs in `src/data/destinations.ts` and `src/data/spots.ts`, and how to write each entry so it behaves correctly in the app. Header and "Why visit" photos are covered separately in `AGENTS.md` ("Destination header images").

Use this whenever you add a country, region, destination or spot, or are asked for "everything worth visiting" in an area.

## The two levels

- **Destination** — a place you travel *to* and base yourself around for a few hours to a few days: a city or town, a national park, a lake, an island, a stretch of coast, a wine region. It gets its own pin, sheet, ranking, climate and crowd data.
- **Spot** — one thing you go *to see or do* within a destination: an attraction, viewpoint, trail, beach, museum, market, a notable cruise or tour. It gets a pin only once the camera is inside its destination.

A spot never stands alone: every spot belongs to exactly one destination. If something is worth a trip on its own and has things to do around it, it is a destination; if it is a single stop within a trip, it is a spot.

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
- **Spots per destination:** typically **3–9**; fewer than 3 usually means the place is not really a destination (fold it into a neighbour), and more than ~10 means it should be split or trimmed. Big draws (a city, a flagship park) sit at the top of the range; small bases (a service town) at the bottom.
- **Each destination's spots** should include its unmissable headline attraction(s) first, then the best secondary stops, then (where relevant) one or two food/culture/market stops. Order spots by importance, not geography.

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

## Writing a destination

Follow an existing entry in the same file (they are the reference); every field below is required unless noted.

- `id` — lowercase, hyphenated, unique, stable (it is the key for saved data; never rename one once it ships). `name` — the common English name, matching its Wikipedia article title where possible; it is also the key into `WIKI_IMAGE_OVERRIDES`.
- `country`, `countryCode` (ISO 3166-1 alpha-2), `timezone` (IANA, e.g. `Pacific/Auckland`), `continent`.
- `coordinates` — the centre of the place as visitors understand it (a town's centre, a park's main visitor hub or visual centre), not a bureaucratic centroid.
- `category` — one of `city | park | beach | mountain | landmark | island | desert | ruin | nature | lake`. Drives the header-image rule (cities/towns need a cityscape; everything else a wide landscape) and the Explore sections, so pick what the place *is*, not what it is near.
- `defaultZoomSpanKm` — the span the map should fit when the destination opens: just big enough to contain the places visitors go within it (~15–30 km for a town, 40–70 km for a park or coast, 100+ km for a large region). **Every spot should lie within about 75% of this span of the destination's coordinates** — widen the span rather than leaving a headline spot off-screen.
- `icon` — a single emoji; `tagline` — one sentence; `description` — 3–4 sentences, concrete (what it is, why people go, one distinctive fact).
- `whyVisit` — exactly three short reasons, strongest first (the app opens its carousel on the first one, in the middle slot). `highlights` — three 2–3 word phrases, one per reason. `whyVisitPhotos` — three Commons file names, one per reason (see `AGENTS.md`).
- `goodToKnow` — exactly three practical tips that trip up first-timers (booking, weather, transport, etiquette, safety). Specific beats generic; no filler.
- `bestMonths` (1–12) and `bestTimeBlurb` containing exactly one `{months}` placeholder — from travel-guide consensus, written for the destination's own hemisphere (southern-hemisphere summer is Dec–Feb).
- `seasonalTags` — only where a real recurring pattern drives crowds (a ski season, a festival, a migration); omit otherwise. Hemisphere-relative tags flip automatically south of the equator; explicit-month tags do not.

Write in the app's voice: plain, specific, enthusiastic without superlatives you cannot back up. No marketing filler, no unverifiable "best in the world" claims, no repetition between description, reasons and tips.

## Writing a spot

- `id` — `<destinationId>-<n>`, numbered from 1 in importance order, never reused.
- `name` — the **exact title of its Wikipedia article** (or the name its article is most likely to be found under). The app looks the spot's photo up by this name, so a creative or abbreviated name silently loads the wrong photo or none. Where the natural name is ambiguous or shared with other places (a common lake or park name), disambiguate or give it a hand-picked photo in `WIKI_IMAGE_OVERRIDES`.
- `category` — `museum | landmark | monument | religious | nature | viewpoint | hike | entertainment | market | beach | historic`. `icon` — one emoji that suits it.
- `coordinates` — the spot's entrance, trailhead or the point visitors stand at, accurate to ~100 m. Never reuse the destination's centre for a spot that is somewhere else.
- `bio` — one sentence, what it is and why it is worth a stop.
- `hours` — a real, current range (`9:00 AM – 5:00 PM`), `Open 24 hours` for open-access places, or a short qualifier (`Daytime tours`, `Tides permitting`) where fixed hours do not apply. `closedDays` (0 = Sunday) only for a regular weekly closure. `specialClosures` only for a fixed-date closure you are confident of.
- `visitHoursMin` / `visitHoursMax` — a range of hours a typical visitor spends, always a range.
- **Cost** — `free: true` for no charge; otherwise `costMin`/`costMax` in the local currency with `currency` as an ISO 4217 code (`NZD`, `EUR`, `GBP`, …; omit only for USD). Use a single price (`costMin === costMax`) or the real range (adult entry, standard tour). Approximate and rounded is fine; invented precision is not. Operator-run experiences (cruises, flights, bungy) list the typical adult price.
- `ticketUrl` — only the spot's single official site (the operator or steward), whether or not it charges. Omit it for open squares and districts with no one steward and for attractions sold by many operators. For public-land trails and parks, the managing agency's page for that park (e.g. the Department of Conservation) is the official site. Never link a booking aggregator or a guess you have not seen resolve.

## New country or region checklist

When the area's country is not yet in the app, also update (the data alone is not enough):

1. `src/utils/countryBounds.ts` — `BOUNDS` (bounding box), `POPULARITY` (tourism-prominence order for pin priority), and `LABEL_POINTS` when the box centre falls off the land (elongated or island countries).
2. `src/components/Map/CountrySheet.tsx` — `COUNTRY_FACTS` (population, languages, currency, area, capital).
3. `src/data/countries.ts` already lists every country; nothing to add. `src/utils/geocode.ts` already maps continents.
4. Make sure the destinations' `countryCode`s match, and that destinations in the area are grouped under that country.

## Photos

Every new destination needs a hand-picked header and three "Why visit" photos, resolved through the image manifest. See `AGENTS.md`; `scripts/photo-picker.ts` (add `--auto` to have it choose) does the searching. Spot photos default to the spot's Wikipedia lead image, which is fine unless it is wrong for the spot.

## Before you finish

- `npx tsc --noEmit -p .` shows no new errors.
- `npx tsx scripts/check-destination-headers.ts` passes (or lists only destinations whose photos you are about to add).
- Ids unique across the file; every spot's `destinationId` exists; no two spots share a name; each destination has 3+ spots.
- Coordinates look right on a map (a swapped sign puts a New Zealand spot in the Atlantic); every spot is within the destination's span.
- Every destination has exactly three `whyVisit`, three `highlights`, three `goodToKnow`; each `bestTimeBlurb` has one `{months}`.
- Costs have a `currency`, free spots say `free: true`, and no `ticketUrl` points anywhere you have not confirmed.
- Say plainly in your summary what you could not verify (hours, prices, links) — these are approximate until someone checks them.
