# ACT run tally (read out in the final report)

Branch curation/act: cut from curation/wa (the WA run's tooling and unmerged WA data) with origin/main merged in for the
new cost rules (costBasis / costPer / needs). Merging curation/act therefore also merges the WA run: WA first, or together.

## Left out / not added
- 40 places across the border in NSW (curation/act/region-act-canberra/outside-act.json): Queanbeyan, Googong, Bungendore, Yass, Murrumbateman, Captains Flat, Michelago, Lake George, Tallaganda NP, Jervis Bay and the Murrumbateman / Lake George wineries: the NSW regions (Southern Highlands & Snowy) should be checked for them.
- Telstra Tower (Black Mountain): closed until December 2027 per Wikivoyage; add back when it reopens.
- CSIRO Discovery Centre (canberra-38): judged keep on an out-of-date Wikivoyage listing, then DROPPED at Quill: CSIRO's own pages say it closed to the public in 2020 and to school visits in 2025.
- Events and weekly markets: Floriade, Summernats, Canberra Balloon Spectacular, National Multicultural Festival, National Folk Festival, Skyfire, Royal Canberra Show, Hartley Hall Markets, Old Bus Depot, Haig Park Village, Little Burley, Belconnen and Fyshwick markets (Fyshwick may trade several days a week: re-check).
- Mount Painter (3.7 km summit walk: only hiking blogs and Wikipedia name it); Nanny Goat Hill and Marion Mahony Griffin lookouts (location in the ACT unconfirmed); Canberra Nature Park (container of ~39 reserves, judged individually); Canberra and Region Visitors Centre (information office); Gubur Dhaura (no visitor access confirmed).
- Rural slice: Camels Hump, Sanctuary Loop, Church Rock, Turkey Hill, Congwarra (parts of Tidbinbilla); Brayshaws and Westermans Homesteads (judged part of Settlers Track, arguable); Tuggeranong Homestead (events and weddings venue); AIS Arena and the aquatic centre (sports venues; the AIS visitor centre is kept as the AIS).
- 63 judge `review` entries are not added (placement.json `review`; the skill no longer stops for them).
## Added but weak
- Corin Forest (namadgi-national-park-9): a snow-play and alpine-slide operator, kept as a place; Wikivoyage says it lies outside Namadgi National Park (it sits on Corin Road beside the park), so its place under the park is arguable.
- Hall: its own Wikivoyage page says it "may not have much to see".
- Weston Park: a local district park, kept because Wikivoyage and VisitCanberra's 100 things name it; the railway, maze and mini golf are Yarralumla Play Station (prices and hours unread).
- The Pinnacle Nature Reserve: one Wikivoyage source (the candidate's second source does not mention it).
- Canberra Centenary Trail: a 145 km loop, not a half-hour visit.
- National Film and Sound Archive: two counted sources, kept under the national-institutions rule.
- Approximate or LOW pins (no OSM route or visitor point; Overpass was down for the run): Canberra Centenary Trail (a point near Hall, not the loop's midpoint), Murrumbidgee Discovery Track (~1 km off its midpoint), Mulligans Flat Woodland Sanctuary (a Commons photo median, provisional), Canberra Deep Space Communication Complex (photo median), Goorooyarroo Nature Reserve (an OSM information board by a car park, entrance unconfirmed), Jerrabomberra West Grasslands (reserve centroid; its walk starts at the Callum Brae Nature Reserve car park), Settlers Track (Brayshaws Hut parking, not a route midpoint), Shepherds Lookout (two non-OSM sources 45 m apart), The Pinnacle (summit area, not a route), Anzac Parade (hand-computed midpoint of the OSM way chain), Lake Burley Griffin (the lake's Wikipedia point, in the water by design).
## Needs the owner
- The destinations the run added (no review gate): Canberra (rank 3, 68 spots) and Namadgi National Park (rank 4, 10 spots, span 60 km). Tidbinbilla Nature Reserve is a Canberra spot, not a destination (only 3 kept places: the reserve, Gibraltar Peak, the Deep Space Complex).
- Filter overrides by me (moved from the script's keep/reject to the judge): Floriade, Summernats, Canberra Balloon Spectacular, Hartley Hall Markets, Canberra Stadium, Manuka Oval, Canberra Theatre Centre, Royal Military College Duntroon, Capital Hill (auto-keep); Anzac Parade, Hospital Hill Lookout, John Knight Memorial Park (auto-reject).
- The audit overturned 3 of 10 script decisions (Aboriginal Dreamings Gallery, Brindabella Hills Winery, Parliamentary Triangle), so the judge re-judged all 64 candidates the script had decided.
- Email in request headers: 13 repo scripts put your email in the User-Agent; this run's scoring and the agents' fetches had already sent it to Wikipedia, Wikivoyage, VisitCanberra and others before I removed it (kept, committed as 058a601).
- ACT spots' division: the geocoder gave a mix of district names and nothing for Namadgi, so every spot is "Australian Capital Territory" (the ACT is one level of government).
- Booroomba Rocks why-visit photo: no passing photo (Commons: 800x600 lead or ~1090 px portrait climbing shots; Openverse nothing; Parks ACT 600x400 aerial): grey card.
## Photos still missing
- Why-visit: none now. Namadgi why2 ("Climb up to Booroomba Rocks") uses Booroomba.JPG (800x600, Leighblackall) by the owner's decision, under the 1280 px minimum; replace with a larger photo when one exists.
- Spots with NO_PHOTO (placeholder): Casuarina Sands, Canberra Centenary Trail, Molonglo Gorge Nature Reserve, Glenburn Homestead, Jerrabomberra West Grasslands, Oakey Hill (only candidate shows a hill with a bin in the frame), Settlers Track (only a Waterhole Hut photo exists), and one more listed in outcome.json. Parks ACT pages carry 600 px photos only (below 960); Openverse's API sat behind a Cloudflare challenge in the browser too.
## Photo flags
- Official photo, permission not confirmed: Canberra Reptile Zoo entrance (canberrareptilezoo.com.au).
- Flickr CC photos (CC BY / BY-SA, 1024 px): Kambah Pool, Murrumbidgee Discovery Track, Canberra Walk-in Aviary, One Tree Hill Lookout, Goorooyarroo, Honeysuckle Creek, Bimberi Peak, Gudgenby Homestead, Corin Forest, Booroomba Rocks. Weak accepts: Discovery Track, Yankee Hat spot photo (a boulder, not the art), Honeysuckle (foundations).
- Botanic Gardens photo: fir0002's rainforest photo is dual GFDL / CC BY-NC licensed (check NC); brightened copy served.
- Yankee Hat art why-visit photo fails the pre-filter only on a Commons category ("Rock paintings of animals"); it is a photograph, kept.
- Parliament House dusk photo (spot and why-visit) is dark on purpose.
## Not verified
- parks.act.gov.au blocks scripts: its pages were read in the in-app browser (titles confirmed for all ticketUrls; hours and fees for the reserves were not stated there, so "Open 24 hours" for open reserves is assumed). The Stromlo Forest Park hours page and the Tidbinbilla visitor figures were read in the browser.
- A judge named Collector Wines, Shaw Estate, Four Winds, Helm, Dog Trap, Pankhurst and Yarrh as NSW from its own knowledge (all rejected as cellar doors anyway).
- 282 enumerator coordinates were hints and wrong in places (Weston Park in England, Callum Brae in New Zealand, Camels Hump at Mount Macedon, Woodland Walk in England); every pin was re-resolved. The resolver's HIGH rating is not proof: St John the Baptist Church, Reid was rated HIGH at the Catholic cathedral 4.3 km away and was corrected from the Commons photo cluster.
- Wikipedia titles were corrected by hand for 20 candidates and views zeroed for 16 whose title pointed to a wrong or broader article.
- Hours and prices from one source: High Court weekday hours (Wikivoyage 2017; the official page gives no opening time), Belconnen Arts Centre free entry (2024 CityNews quote), Strathnairn Arts free entry (Wikivoyage), the National Arboretum's free entry (no fee is stated), Calthorpes House tour days (official page: Saturday 1-4), the Gibraltar Falls lookout walk (closed until further notice per Parks ACT).
- Corrected from the drafts: the zoo's adult price is $65 online / $68 at the gate (not $55); Tidbinbilla $16.09 per vehicle per day (not $15.53); the Dinosaur Museum is open daily; Mount Stromlo's "rebuilt after 2003" and "star nights" claims were cut; Parliament House has no photo-ID rule (airport-style screening, allow 15 minutes).
- Coordinate audit (audit-spot-coordinates.ts, 31 of 68 Canberra spots and 6 of 10 Namadgi spots flagged): every flag was read and kept. The references were centroids (a reserve, a lake, a locality), a different place of the same name (the Catholic cathedral for St John's; another NFSA office for the NFSA), or Wikipedia points that are wrong (Gibraltar Falls, 7.6 km off; Lanyon Homestead 2.1 km, where two other sources agree with our point).
