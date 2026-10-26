# SA run: decisions the apply stage must honour

## Park passes to add to src/data/parkPasses.ts (with their source)
- `flinders-chase` — name "Flinders Chase Pass", adult 1-day AUD 14.90 (range up to 22.40 for two days). Source: https://www.parks.sa.gov.au/parks/flinders-chase-national-park read in the in-app browser 2026-10-25 ("Flinders Chase National Park Entry Park Fee $14.90 per adult"; the page header shows "Site entry: $22.40 per person"; an older Fees tab line said $13.00 and is superseded). Spots inside the park with no fee of their own are `free: true`, `needs: 'park-pass'`, `parkPass: 'flinders-chase'`. The price is never put on a spot.
- Kangaroo Island Wilderness Trail: AUD 212 per walker (same page; supersedes the unsourced $161).
- Other SA parks: Parks SA lists per-vehicle fees for some (Lake Eyre, Witjira, The Bubbler/Blanche Cup: AUD 14.40 per vehicle) = costBasis 'park', costPer 'Per Vehicle/Day'. Desert Parks Pass (Simpson Desert): permit, price not published on a Parks SA page.

## Checks owed (a real browser or the owner)
- Wheal Hughes Copper Mine (Yorke, copper-coast-6): Wikipedia says tourists can no longer go underground, one source says closed 2008. Confirm public access before applying; if closed, drop it.
- mungeranniehotel.com.au (domain unconfirmed) and woomera.com.au (deep links answer 200 for any path): browser check before any ticketUrl ships.
- Kingscote Pelican Feeding, Kingscote Jetty, Red Banks Beach (KI): LOW pins, coordinates null.
