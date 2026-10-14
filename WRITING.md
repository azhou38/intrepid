# Writing: names, fields and copy for destinations and spots

How to write each entry in `src/data/destinations.ts` and `src/data/spots.ts` so it reads well and behaves correctly in the app: names, every field, the voice for descriptions, reasons, taglines and bios, and the checklist to run before finishing. Which places belong, and where each goes, is in `COVERAGE.md`; photos are in `IMAGES.md`.

## Names (countries, destinations and spots)

Applies to every `name` shown in the app.

- **Just the place's own name.** Never add the destination, region or country to a spot's name: "Russell", not "Russell, New Zealand"; "Queens Park", not "Queens Park, Invercargill"; "Mount Victoria", not "Mount Victoria, Wellington". The app already shows where a place is. The same goes for a destination's name ("Wellington", not "Wellington, New Zealand").
- **Capitalise each word.** Title case: every word starts with a capital ("Te Paki Sand Dunes", "Hundertwasser Toilets", "Wellington Waterfront"). Short joining words (*of, the, and, to, in, on, a, de, la*…) stay lowercase unless they open the name ("Craters of the Moon", "Bridge to Nowhere", "Bay of Islands"). Country names follow the same rule ("Côte d'Ivoire", "United States").
- **A needed disambiguator belongs in `wiki`, not `name`.** If the Wikipedia article is titled "Russell, New Zealand" or "Blue Lake (Rotorua)", put that exact title in the spot's `wiki` field (see "Writing a spot"); the shown name stays "Russell" or "Blue Lake". Two places may then share a shown name — that is fine, search results show which destination each belongs to.
- **Keep a local alternative name only when it is part of the name people use**, such as "Mykonos Town (Chora)". It is not a place qualifier.

## Writing a destination

Follow an existing entry in `src/data/destinations.ts` (they are the reference); every field below is required unless noted.

- `id` — lowercase, hyphenated, unique, stable (it is the key for saved data; never rename one once it ships). `name` — the common English name, matching its Wikipedia article title where possible; it is also the key into `WIKI_IMAGE_OVERRIDES`.
- `country`, `countryCode` (ISO 3166-1 alpha-2), `timezone` (IANA, e.g. `Pacific/Auckland`), `continent`.
- `coordinates` — the centre of the place as visitors understand it (a town's centre, a park's main visitor hub or visual centre), not a bureaucratic centroid.
- `category` — one of `city | park | beach | mountain | landmark | island | desert | ruin | nature | lake`. Drives the header-image rule (cities/towns need a cityscape; everything else a wide landscape) and the Explore sections, so pick what the place *is*, not what it is near.
- `defaultZoomSpanKm` — the span the map should fit when the destination opens: just big enough to contain the places visitors go within it (~15–30 km for a town, 40–70 km for a park or coast, 100+ km for a large region). **Every spot should lie within about 75% of this span of the destination's coordinates** — widen the span rather than leaving a headline spot off-screen.
- `icon` — a single emoji; `tagline` — one sentence; `description` — 3–4 sentences, concrete (what it is, why people go, one distinctive fact).
- `whyVisit` — exactly three short reasons, strongest first (the app opens its carousel on the first one, in the middle slot). `highlights` — three 2–3 word phrases, one per reason. `whyVisitPhotos` — three Commons file names, one per reason (see `IMAGES.md`).
- `goodToKnow` — exactly three practical tips that trip up first-timers (booking, weather, transport, etiquette, safety). Specific beats generic; no filler.
- `bestMonths` (1–12) and `bestTimeBlurb` containing exactly one `{months}` placeholder — from travel-guide consensus, written for the destination's own hemisphere (southern-hemisphere summer is Dec–Feb).
- `seasonalTags` — only where a real recurring pattern drives crowds (a ski season, a festival, a migration); omit otherwise. Hemisphere-relative tags flip automatically south of the equator; explicit-month tags do not.

## Voice (descriptions, reasons, taglines and spot bios)

Applies to `tagline`, `description`, `whyVisit`, `highlights`, `goodToKnow` and every spot `bio`.

- **Facts from sources only.** Every claim traces to a source (Wikipedia, Wikivoyage, the operator or managing agency). Hours, prices and "best in the world" claims that cannot be sourced are cut, or flagged as approximate. Never invent.
- **Concrete, not marketing.** Say what the place is, why people go and one distinctive fact. No filler ("stunning", "must-see"), no superlatives that cannot be backed.
- **No repetition** within an entry (description, reasons, tips and tagline each say something different) or across entries (two destinations should not share near-identical phrasing).
- **One sentence** for a `tagline` and a spot `bio`; a `description` is 3–4 sentences.
- **Reasons match photos.** Choose the three `whyVisit` reasons, then find a photo for each; if no honest photo exists, rewrite the reason (see `IMAGES.md`).

Write in the app's voice: plain, specific, enthusiastic without superlatives you cannot back up. No marketing filler, no unverifiable "best in the world" claims, no repetition between description, reasons and tips.

## Writing a spot

- `id` — for a spot of a destination, `<destinationId>-<n>`, numbered from 1 in importance order and never reused. For a standalone spot, its own lowercase hyphenated slug (`glenorchy`), unique among all spot and destination ids.
- `destinationId` — the parent destination's id, or **omitted** for a standalone spot, which then needs `country`, `countryCode`, `continent` and `timezone` (see "Standalone spots in the app" in `COVERAGE.md`).
- `name` — the name shown in the app, following "Names" above: the place's own name in title case, with no destination, country or other disambiguator.
- `wiki` — the **exact title of the spot's Wikipedia article**, only when it differs from `name` (usually a disambiguated title such as "Russell, New Zealand" or "Blue Lake (Rotorua)"). The app looks the spot's photo up by this title (`spotPhotoTitle`: `wiki`, else `name`), and `WIKI_IMAGE_OVERRIDES` and the image manifest are keyed by it, so a creative or abbreviated title silently loads the wrong photo or none. When you rename a spot, move its old name into `wiki` if that was its article title. Where the article title is itself ambiguous (a common lake or park name), give it a hand-picked photo in `WIKI_IMAGE_OVERRIDES`.
- `category` — `museum | landmark | monument | religious | nature | viewpoint | hike | entertainment | market | beach | historic`. `icon` — one emoji that suits it.
- `coordinates` — the spot's entrance, trailhead or the point visitors stand at, accurate to ~100 m. Never reuse the destination's centre for a spot that is somewhere else.
- `bio` — one sentence, what it is and why it is worth a stop.
- `hours` — a real, current range (`9:00 AM – 5:00 PM`), `Open 24 hours` for open-access places, or a short qualifier (`Daytime tours`, `Tides permitting`) where fixed hours do not apply. `closedDays` (0 = Sunday) only for a regular weekly closure. `specialClosures` only for a fixed-date closure you are confident of.
- `visitHoursMin` / `visitHoursMax` — a range of hours a typical visitor spends, always a range.
- **Cost** — `free: true` for no charge; otherwise `costMin`/`costMax` in the local currency with `currency` as an ISO 4217 code (`NZD`, `EUR`, `GBP`, …; omit only for USD). Use a single price (`costMin === costMax`) or the real range (adult entry, standard tour). Approximate and rounded is fine; invented precision is not. Operator-run experiences (cruises, flights, bungy) list the typical adult price.
- `ticketUrl` — only the spot's single official site (the operator or steward), whether or not it charges. Omit it for open squares and districts with no one steward and for attractions sold by many operators. For public-land trails and parks, the managing agency's page for that park (e.g. the Department of Conservation) is the official site. Never link a booking aggregator or a guess you have not seen resolve.

## Photos

Every new destination needs a hand-picked header and three "Why visit" photos, resolved through the image manifest. All the rules, and how to run `scripts/photo-picker.ts`, are in `IMAGES.md`. Spot photos default to the spot's Wikipedia lead image, which is fine unless it is wrong for the spot.

## Before you finish

- `npx tsc --noEmit -p .` shows no new errors.
- `npx tsx scripts/check-destination-headers.ts` passes (or lists only destinations whose photos you are about to add).
- Ids unique across the file; every spot has a `destinationId` that exists or the four standalone fields; no two spots share a name.
- Each destination has enough surrounding spots to justify being a destination (see "The two levels" in `COVERAGE.md`); lone attractions are listed as standalone spots, not promoted.
- `scripts/verify-coordinates.ts` run for the area when you have network access; coordinates look right on a map (a swapped sign puts a New Zealand spot in the Atlantic); every spot is within its destination's span (otherwise it is standalone, or the span is wrong).
- Every destination has exactly three `whyVisit`, three `highlights`, three `goodToKnow`; each `bestTimeBlurb` has one `{months}`.
- Costs have a `currency`, free spots say `free: true`, and no `ticketUrl` points anywhere you have not confirmed.
- Say plainly in your summary what you could not verify (hours, prices, links) — these are approximate until someone checks them.
