
## nsw-south-coast vs nsw-southern-highlands-snowy (decided in south-coast placement)

Decided once, in `region-nsw-south-coast/placement.json`. The southern-highlands-snowy placement must drop these and not place them again:

| Place | Decision | Why |
|---|---|---|
| Morton National Park | Proposed destination `morton`, centred on the Fitzroy Falls visitor hub (-34.6483, 150.4824), span 40 km | Highlands skeptic pinned the same hub; the south-coast skeptic's centroid (-35.23, 150.20) is 70 km away and is not used |
| Fitzroy Falls | `morton-1` | Inside the Morton span, the park's main visitor stop |
| Belmore Falls | `morton-2` | 7 km from the hub |
| Kangaroo Valley, Hampden Bridge | `morton-3`, `morton-4` | Gateway village 10 km from the hub |
| Carrington Falls | `budderoo-2` (Budderoo NP, not Morton) | It lies on the Budderoo plateau |
| Pigeon House Mountain | `ulladulla-1` | Morton's southern section is 78 km from the Fitzroy hub, so it cannot sit in the Morton span; visitors reach it from Ulladulla/Milton (18 km) |
| Macquarie Pass National Park | `budderoo-3` | Highlands pass left it in review; adjacent to Budderoo, no sub-spots |

All are proposals (new destinations are listed for the owner, not added). If Morton or Ulladulla is declined, the places become standalone spots (ids in `new_destinations[].if_declined_standalone`), and still must not be placed by the other region.

## nsw-central-coast-hunter vs nsw-mid-north-coast and nsw-sydney (decided in central-coast-hunter placement)

Decided once, in `region-nsw-central-coast-hunter/placement.json`. The other passes must not place these again:

| Place | Decision | Why |
|---|---|---|
| Barrington Tops National Park, Careys Peak | Left to mid-north-coast (`barrington-tops-national-park`; Careys Peak is its `-2` "Careys Peak Lookout") | Same park and same summit; this region drops them |
| Devils Hole Lookout, Gloucester Falls | Placed here as `barrington-tops-national-park-4` and `-5`, spots of the mid-north-coast proposed destination (standalone `devils-hole-lookout`, `gloucester-falls` if it is declined) | The mid-north-coast pass reserves `-3` for its held Gloucester |
| Yacaaba Headland Walking Track | Stays with Myall Lakes National Park (mid-north-coast); not in Port Stephens | Myall Lakes and Port Stephens centres are about 28 km apart, so the Hawks Nest side belongs to Myall |
| Dharug National Park, Wisemans Ferry, Great North Road | Proposed destination `dharug-national-park` here (centre Wisemans Ferry, span 40) | The Sydney pass lists Dharug National Park and Wisemans Ferry as keeps and Old Great North Road as review: it must drop them (Old Great North Road is the same road as Great North Road here) |
| Great North Walk | Existing Sydney spot (sydney-64): skipped | Not re-added |
| Brooklyn | Not placed here (Sydney pass) | 36 km from Sydney, outside its 30 km reach, and 18 km from the proposed Central Coast centre: if the Sydney pass leaves it outside Sydney it fits `central-coast` as a spot |

Proposals made here (listed for the owner, not added): `newcastle` (includes the Lake Macquarie places), `hunter-valley` (includes Maitland, Morpeth and Watagans National Park), `port-stephens` (includes Tomaree National Park), `central-coast` (includes Bouddi, Brisbane Water and Wyrrabalong National Parks), `dharug-national-park` (thin). Yengo National Park is standalone. National parks folded into a town or region destination are flagged `np_exception` in the placement.

## nsw-new-england-north-west vs nsw-mid-north-coast / nsw-central-coast-hunter / warrumbungle (decided in new-england-north-west placement)

| Place | Decision | Why |
|---|---|---|
| Ebor Falls, Point Lookout, Cathedral Rock NP, Cunnawarra NP | Proposed destination `new-england-national-park` (centre -30.59279, 152.45857, span 50) | Waterfall Way stops west of the escarpment; Dorrigo National Park (mid-north-coast proposal) is 37 km east of Ebor Falls, outside its 30 km radius. The mid-north-coast pass must not place these |
| Wollomombi Falls, Apsley Falls | Proposed destination `oxley-wild-rivers-national-park` (derived centre at the midpoint of the two falls, span 50) | Armidale's span is 45 km, so Wollomombi (37 km) is left to its park |
| Burning Mountain | Held for pin (not placed); standalone `burning-mountain-nature-reserve` when pinned | Upper Hunter; the Hunter pass has not placed it, so it must not be placed there as well |
| Pilliga Sandstone Caves, Pilliga Hot Artesian Bore Baths | Caves held for pin; baths standalone `pilliga-hot-artesian-bore-baths` | Pilliga caves are 50 km and the baths 104 km from Warrumbungle's centre (45 km radius), so neither is a Warrumbungle spot; the outback pass must not place them |
| Barrington Tops | Not touched here | Decided in mid-north-coast |

Proposals only (new destinations are listed for the owner). If a destination is declined, its members become standalone spots (ids in `new_destinations[].if_declined_standalone`).

## nsw-riverina-murray vs nsw-outback-far-west (decided in riverina-murray placement)

Decided once, in `region-nsw-riverina-murray/placement.json`. The outback pass must drop these and not place them again:

| Place | Decision | Why |
|---|---|---|
| Yanga National Park | Proposed destination `yanga-national-park` (thin; standalone `yanga-national-park` if declined) | Judged and owned here; the outback pass holds it only as review and must drop that review |
| Murrumbidgee Valley National Park | Proposed destination `murrumbidgee-valley-national-park` (span 30 km, centroid point to be replaced by the main access) | Linear park between Narrandera and Balranald; Middle Beach is part of it and stays rejected |
| Willandra National Park | Proposed destination `willandra-national-park` | Different place from Willandra Lakes (Mungo), which stays with the outback pass |
| Wentworth, Junction Park, Old Wentworth Gaol, Perry Sandhills | Proposed destination `wentworth` (`wentworth-1` to `-3`) | The outback pass rejected Wentworth as a town and holds no spots there |
| Balranald (Discovery Centre, Southern Cross Museum, Malcolm Building, Heritage Trail, Yanga Homestead/Woolshed/Lake Circuit) | Rejected here | Sights inside Yanga are part of the park; the outback pass rejected the town ones too; no Balranald destination is proposed |

Other decisions in this region: Cocoparra National Park is folded into the proposed `griffith` destination (`np_exception`); Cootamundra (Bradman's Birthplace Museum, Cricket Captains Walk) and Tocumwal (Town Beach, Big Cod) are thin and stay standalone; High Country Rail Trail and Murray to the Mountains Rail Trail go to the Victoria run. Proposed here (listed for the owner, not added): `wagga-wagga`, `albury`, `hay`, `griffith`, `junee`, `gundagai`, `wentworth`, `woomargama-national-park`, `murray-valley-national-park`, `willandra-national-park`, `yanga-national-park`, `murrumbidgee-valley-national-park`. Held for a pin: Wiradjuri Walking Track, Tumbarumba to Rosewood Rail Trail, Narrandera Flora and Fauna Reserve, The Rock.

## nsw-sydney vs nsw-central-coast-hunter and nsw-south-coast (decided in sydney placement)

Decided once, in `region-nsw-sydney/placement.json`. Other passes must not place these again:

| Place | Decision | Why |
|---|---|---|
| Dharug National Park, Wisemans Ferry, Old Great North Road | Dropped from Sydney; owned by central-coast-hunter (`dharug-national-park`) | Decided there first; Sydney's skeptic had them as outside the 30 km reach (56-58 km) anyway |
| Brooklyn | `central-coast-22`, spot of the proposed Central Coast; standalone `brooklyn` if declined | 35.6 km from Sydney (outside 30 km), 18 km from Gosford. central-coast-hunter should not use number 22 for anything else |
| Royal National Park | Proposed destination `royal-national-park`, centre Audley (-34.0742, 151.0555), span 40 km; spots `royal-national-park-1..7` = Audley, Wattamolla Beach, Bundeena to Otford Coast Track, Garie Beach, Wedding Cake Rock, Bundeena, Burning Palms Beach | The south-coast pass placed no Royal NP stop. Every national park is a destination; Audley, Wedding Cake Rock and Bundeena are inside Sydney's 30 km reach but are the park's own stops, so they are not Sydney spots. The south-coast pass must not add Royal NP places (Figure Eight Pools is review, North Era/Big Marley/Werrong rejected, all under the Coast Track) |
| Captain Cook's Landing Place | Merge into existing `sydney-53` (Kamay Botany Bay National Park); no new id | Same park; skeptic kept it only as the named landing site |
| Ku-ring-gai Chase NP, Bobbin Head | Sydney spots `sydney-76`, `sydney-77` | Inside 30 km; urban-park precedent (Lane Cove, Garigal, Berowra Valley) |
| West Head, Barrenjoey Lighthouse, Palm Beach, Whale Beach | Proposed `pittwater` (`pittwater-1..4`) | 31-34 km out, clustered within 4 km of Palm Beach |

New Sydney ids used: `sydney-74` to `sydney-81`. `sydney-82` is reserved if the owner keeps the Landing Place separate, `sydney-83..85` if Royal National Park is declined and Audley, Wedding Cake Rock and Bundeena become Sydney spots. Proposals (not added): `pittwater`, `hawkesbury` (Windsor, Cattai, Scheyville), `penrith`, `macarthur` (Camden, Campbelltown, Picton, Thirlmere Lakes), `royal-national-park`. Yerranderie is the one standalone.

## nsw-blue-mountains-central-west vs the other NSW passes (decided in blue-mountains-central-west placement)

Decided once, in `region-nsw-blue-mountains-central-west/placement.json`. No other pass had placed Wollemi, Capertee, Kanangra, Lithgow, Mudgee, Bathurst, Orange, Dubbo, Cowra or Parkes, so nothing was dropped from another region.

| Place | Decision | Why |
|---|---|---|
| Wollemi National Park | Kept, held for a visitor-point pin; standalone `wollemi-national-park` (or a future park destination). Other passes must not place it | Only a centroid exists, 69 km from Lithgow. Dharug (central-coast-hunter) and Yengo (standalone there) are separate parks and are not touched |
| Glow Worm Tunnel, Gardens of Stone, Capertee Valley, Zig Zag Railway | Proposed destination `lithgow` (`lithgow-1` to `-4`, span 70, centre Lithgow town) | Gateway town; Gardens of Stone folded in (np_exception). Zig Zag is 19 km from the Blue Mountains centre but reached via Lithgow, so it is not `blue-mountains-19` |
| Kanangra Walls, Jenolan Caves | Proposed destination `kanangra-boyd-national-park` (centre Kanangra Walls, span 50, thin: two spots) | Jenolan is 34 km from the Blue Mountains centre but reached via Oberon/Hartley, 20 km from Kanangra |
| Six Foot Track | `blue-mountains-19`, spot of the existing Blue Mountains, held for a computed route midpoint | Walked from Katoomba; the only new Blue Mountains id. Megalong Valley and Everglades Gardens stay review (would be `-20`, `-21`) |
| Bathurst, Orange (`orange-nsw`), Dubbo, Mudgee, Cowra, Parkes | Proposed destinations (Mudgee and Parkes thin) | Hubs with their own guide chapters; Wellington Caves (51 km) goes to Dubbo, not Mudgee. Carcoar goes to Orange (36.7 km) |
| Coolah Tops, Weddin Mountains, Abercrombie River National Parks, Utes in the Paddock | Standalone | No kept sub-spots / no destination reaches them (park pins are centroids to be replaced in research) |
| Hill End, Warrumbungle spots | Existing, unchanged | |

Held for a pin (not applied): Six Foot Track, Mount Panorama Circuit, Plane on a Stick, Mudgee Wine Region, Orange Wine Region, Wollemi National Park. Proposals only: `bathurst`, `orange-nsw`, `dubbo`, `mudgee`, `lithgow`, `kanangra-boyd-national-park`, `cowra`, `parkes`.

## nsw-northern-rivers vs nsw-mid-north-coast (decided in northern-rivers placement)

Decided once, in `region-nsw-northern-rivers/placement.json`. The mid-north-coast pass placed nothing north of Woolgoolga, so nothing was dropped from it; it must not place these:

| Place | Decision | Why |
|---|---|---|
| Yuraygir National Park, Grafton, Border Ranges National Park | Existing standalone spots, unchanged, not re-added | They sit in the app already; no kept sibling spots justify a park destination, and Yuraygir stays standalone (not under Yamba, 43 km away) |
| Angourie Point | `yamba-1`, held for a pin (OSM locality point) | Surf headland 5 km from Yamba at the northern end of the Yuraygir coast; the Yuraygir Coastal Walk itself is not placed here (it is part of the existing Yuraygir spot) |
| Maclean, Iluka, Iluka Nature Reserve | `yamba-4`, `yamba-5`, `yamba-6` (Iluka Nature Reserve is an np_exception) | Clarence River mouth cluster within 16 km of Yamba |
| Evans Head | `bundjalung-national-park-1` (thin destination, centre held for pin) | Gateway at the park's southern end, 21 km from its centroid |
| Wooli, Brooms Head, Ulmarra | Not kept here (review or reject) | Yuraygir walk hamlets and a river village; any later keep belongs to the Yuraygir/Clarence Valley side |

Proposed here (listed for the owner, not added): `byron-bay`, `ballina`, `tweed-heads` (includes Wollumbin National Park, np_exception), `lismore` (includes Nightcap National Park and Minyon Falls, np_exception), `yamba` (includes Iluka Nature Reserve, np_exception), `bundjalung-national-park` (thin). Toonumbar National Park is the one new standalone. Ids continue the earlier `curation/nsw` northern-rivers run (never shipped); do not reuse the gaps. Held for a pin: Nightcap, Wollumbin, Angourie Point and the Bundjalung centre.
