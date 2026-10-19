# NSW coordinate audit (scripts/audit-spot-coordinates.ts --country AU), decisions

250 of the 435 AU spots in the audit were new in this run and flagged. No pin was moved on the audit's account; every flag falls in one of these groups:

- **Reference is the wrong place** (name match in another country or region): Fleet Air Arm Museum (Wikipedia point in England), West Head (New Zealand), Transit Hill (another Transit Hill), Main Beach (Gold Coast), Bogey Hole and Careys Peak (a different bay / lookout of a similar name), Tallow Beach. The pin is the correct local feature.
- **Park, shire and region centroids versus the visitor point** (National Parks, Oxley, Kosciuszko, Wollemi, Yengo, Menindee Lakes, Sturt, Cobar, Kempsey, Parkes and the other "Shire Council" matches): the pin is deliberately an entrance, lookout, picnic area or town centre, not the polygon centroid.
- **Routes** (Six Foot Track, Kiama and Port Macquarie coastal walks, Bathers Way, Light to Light, Murramarang, Wiradjuri, rail trail): pinned at the route midpoint per COVERAGE.md; the reference is a point somewhere along the route.
- **Town points** within about 2 km of Wikipedia's rounded point: the pin is an OSM place node or the town's visitor centre.
- **Water flags**: Wollomombi Falls, Ebor Falls (waterfall nodes on the river), Wallaga Lake, Menindee Lakes (lakes), Brisbane Water National Park (park point). All are features that sit in or beside water.
- The 45 flags on existing Sydney spots (older entries, round pins on Sydney Harbour NP, Wendy Whiteley's Garden, Berowra Valley, Katoomba, Blue Mountains Botanic Garden) predate this run and were left.
