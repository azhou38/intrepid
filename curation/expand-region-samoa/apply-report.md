# Samoa apply report

Applied: 2 destinations (apia, savaii), 25 spots: apia-1..7, savaii-1..7 and 9, 10 standalone Upolu spots. All photoless (header NO_PHOTO, why-visit grey cards, spots with no photo) for Lens.
Commits: Apia (+7 spots), Savai'i (+8 spots), standalone (10).
Held: savaii-8 Satoalepai Turtle Reserve (no coordinates, turtle-welfare concerns); id savaii-8 left unused.

## Pins
Apia centre: OSM place node "Apia" (resolve-pin MEDIUM) -13.834523,-171.763095, not the clock tower. Spot pins from the research shards (HIGH/MEDIUM), except LOW and flagged: apia-6 Samoa Cultural Village (decoded plus code, within ~40 m of the STA information fale), savaii-4 Afu Aau Falls (Wikidata/Wikivoyage only), apia-1 Mount Vaea (trail midpoint from OSM geometry).

## Prices (WST), official STA listing pages override research
STA-sourced: apia-2 20, apia-4 3, apia-5 5, apia-6 20 tour, to-sua 15, piula 5, savaii-1 5, savaii-2 5, savaii-4 10, savaii-5 20 tour, savaii-7 5, savaii-9 5, museum of Samoa free (donation), Mt Vaea / Togitogiga / Papapapai-tai free, O Le Pupu Pu'e free entry.
No fee found, set free/open: Lake Lanoto'o, Lalomanu, Namu'a, Return to Paradise, Manono (STA page lists no price), Pulemelei Mound (savaii-3; no STA page, private plantation, informal guide fees reported). apia-7 cathedral free (no source beyond research).
Single third-party price, unverified: savaii-6 Falealupo 20 (Lonely Planet + OSM fee tag; no STA page). Piula: vehicle fee only if using car park, not counted.

## Links
STA listing URLs used (titles opened in-app). Not title-checked: lake-lanotoo (rate-limited), savaii-1 (old sightseeing deep link, title-checked). sta-links.json keys savaii-2/4/7 and the Saleaula/Paia slugs are misaligned with placement ids; I matched by place name: savaii-2 Saleaula, savaii-4 Afu Aau (afu-aau-fallsolemoe-falls, price page read but link itself not separately opened), savaii-9 Paia. No link: apia-7, savaii-3, savaii-6 (Falealupo charges but has no official site: lint no-ticket residual).

## Names / wiki
Renamed: "Museum of Samoa" (wiki Falemata'aga), "Immaculate Conception Cathedral" (wiki "Immaculate Conception Cathedral, Apia"), "Mount Matavanu", "Saleaula Lava Field". wiki titles verified for those only; Wikipedia API returned 404/errors for other titles (O Le Pupu-Pu'e, To Sua, Palolo Deep, Togitogiga etc.), so no wiki set: Lens should check for the exact titles.
Reason fix: apia whyVisit 3 "Base yourself..." -> "Explore Upolu on day trips" (lint action verb).

## Districts
All 25 got a real district: Tuamasaga (apia 1-7, Lanoto'o, Papapapai-tai), Atua (O Le Pupu, Togitogiga, Piula, To Sua, Lalomanu, Namu'a), Aiga-i-le-Tai (Manono), Palauli / Gagaifomauga / Gaga'emauga / Vaisigano (Savai'i). Suspect: return-to-paradise-beach got Gaga'emauga (a Savai'i district) though it is on Upolu's south-west; check.

## Checks
tsc: only the known MapScreen errors. bio-fit, tagline-fit, blurb-fit pass. lint residuals: return-to-paradise-beach bio "marketing word Paradise" (the film title, false positive); savaii-6 no-ticket. No pin / pin-shared lines. Photo-related lint left for Lens.
Standalone spots were inserted into STANDALONE_SPOTS (apply-placement.py would have put them at the end of VICTORIA_SPOTS; moved by hand). Also added ids to scripts/coverage-regions.json (samoa-upolu standalone + destinations, samoa-savaii destinations).
