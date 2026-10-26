# SA run: decisions the apply stage must honour

## Park passes to add to src/data/parkPasses.ts (with their source)
- `flinders-chase` — name "Flinders Chase Pass", adult 1-day AUD 14.90 (range up to 22.40 for two days). Source: https://www.parks.sa.gov.au/parks/flinders-chase-national-park read in the in-app browser 2026-10-25 ("Flinders Chase National Park Entry Park Fee $14.90 per adult"; the page header shows "Site entry: $22.40 per person"; an older Fees tab line said $13.00 and is superseded). Spots inside the park with no fee of their own are `free: true`, `needs: 'park-pass'`, `parkPass: 'flinders-chase'`. The price is never put on a spot.
- Kangaroo Island Wilderness Trail: AUD 212 per walker (same page; supersedes the unsourced $161).
- Other SA parks: Parks SA lists per-vehicle fees for some (Lake Eyre, Witjira, The Bubbler/Blanche Cup: AUD 14.40 per vehicle) = costBasis 'park', costPer 'Per Vehicle/Day'. Desert Parks Pass (Simpson Desert): permit, price not published on a Parks SA page.

## Checks owed (a real browser or the owner)
- Wheal Hughes Copper Mine (Yorke, copper-coast-6): Wikipedia says tourists can no longer go underground, one source says closed 2008. Confirm public access before applying; if closed, drop it.
- mungeranniehotel.com.au (domain unconfirmed) and woomera.com.au (deep links answer 200 for any path): browser check before any ticketUrl ships.
- Kingscote Pelican Feeding, Kingscote Jetty, Red Banks Beach (KI): LOW pins, coordinates null.

## Parks that charge entry: passes (one per park, as Tidbinbilla), applied at merge
A spot inside a park that charges entry and has no fee of its own is `free: true`, `needs: 'park-pass'`, `parkPass: '<pass id>'`; the park's own spot (the park itself) is costBasis 'park' with the price and costPer. Passes to define in parkPasses.ts (each with its source, never guessed):
- `innes` — Dhilba Guuranda-Innes National Park, AUD 14.40 per private vehicle per day (Parks SA; per vehicle, like Tidbinbilla).
- `flinders-chase` — AUD 14.90 per adult (see above).
- `lake-eyre`, `witjira`, `wabma-kadarbu` (The Bubbler / Blanche Cup) — AUD 14.40 per vehicle each (Parks SA park pages, read by the Outback Quill agent).
- Any other park whose Quill entry names a fee: add its pass the same way at merge.
- Goolwa Motor Museum (fleurieu): Tripadvisor and Wanderlog list it as permanently closed and no official site was found; browser check (escapegvh.com.au page, Cloudflare wall) before applying; if closed, drop.
- Rename at merge: Strathalbyn Districts Museum -> "Strathalbyn Heritage Museum"; Goolwa Animal Farm (not Animal Farm Goolwa).
- Softfoot Alpaca Farm (fleurieu, mclaren-vale-16): in Hindmarsh Valley, move under victor-harbor.

## Held from the apply list (closed or unfinished; the report lists each with what unblocks it)
- Migration Museum (adelaide-15): closed from 1 July 2026 for 18-24 months. Unblocks on reopening.
- Tandanya (adelaide-16): closed, relaunch planned for 2027. Unblocks on reopening.
- Classic Jets Fighter Museum (adelaide-62): possibly closed, no price, no working site. Unblocks on a source confirming it is open and its price.
- Goolwa Motor Museum and Wheal Hughes Copper Mine: see the checks above.

## Merges at the final merge
- Katarapko (riverland-6) into Murray River National Park (riverland-2). Ninety Mile Beach (coorong-national-park-2) and the agency's Ocean Beach are one stretch: keep one. Raukkan (-11) and Raukkan Church (-10) are one stop: merge unless the pin pass finds distinct points.
- Parks: add pass `ikara-flinders` (AUD 14.40 per vehicle), `gluepot` (AUD 10 per vehicle per day) to the park-pass plan above.
- Wording: no current closure (floods, roadworks, 6-9 Nov park closure) in any bio or tip; say "check current conditions" at most.
- Adelaide Holocaust Museum (adelaide-51): closed for re-curation until December 2026. Held. Army Museum of South Australia (adelaide-52): to be relocated from Keswick Barracks to a venue not yet chosen. Held until a source confirms where and when it is open.
- Bay Discovery Centre (adelaide-53): no cost (council page behind a bot wall): browser check; unfinished until it has a cost.
- Deep Creek NP (fleurieu): add pass `deep-creek` (AUD 14.40 per vehicle, Deep Creek NP page). Blowhole Beach (yankalilla-?) is inside it: free, needs 'park-pass', parkPass 'deep-creek' (not its own 'park' price).
- Talisker Conservation Park (fleurieu): closed until further notice after a fire (NPWS alert); its NPWS page 404s. Re-check at apply; hold if still closed.
- Yunta (flinders): its only draw is the annual Picnic Races (an event); held unless a source names a permanent sight.
- Thin evidence, kept (listing only, no page loads): Pekina Creek Rock Carvings, Southern Flinders Rail Trail, Mount Ellen Lookout.
- Jamestown Railway Station Museum (barossa-clare): no cost or official site found; unfinished: held until a price or source turns up.
