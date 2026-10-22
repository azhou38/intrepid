# Coordinate audit decisions: the four NT regions added after Darwin & Top End (audit-spot-coordinates.ts --country AU, 100 m)

No pin is in water. Every flag is a decision to keep the visitor point over a reference's centroid:

- Parks and reserves (Trephina Gorge, Arltunga, Cutta Cutta Caves, Jatbula Trail start area, Katherine Gorge): OSM and Wikipedia give the reserve centroid or a town-rounded point; pins are the day-use area, visitor centre, jetty or feature node (sources recorded per spot in curation/nz-rest/quill/all-notes.json).
- Long routes (Larapinta Trail 20.6 km from one OSM segment, Jatbula Trail, Kubara Pools Walk, Uluru Base Walk): pinned at the midpoint of the whole route by design (COVERAGE.md); the Larapinta midpoint was computed from 224.8 km of OSM ways, the Base Walk from relation 13434620.
- Cahills Crossing (Wikipedia point 64 km away): Wikipedia's point is wrong; the pin is the OSM low-water-crossing way, 3 m from the Commons photo median.
- Redbank Gorge (OSM picnic site 1.3 km away): the pin is the gorge node, not the car park; Wikipedia's point (51 km) is wrong.
- Ormiston Gorge, Edith Falls, Yulara, Mount Sonder, Serpentine Gorge (Wikipedia 1-7 km): Wikipedia's points are town- or area-rounded; pins are OSM feature nodes of the right type.
- Alice Springs Desert Park, Women's Museum of Australia (alice-springs-9): the Women's Museum point is from Wikipedia (no OSM feature names the Old Gaol): low confidence, owner to check on the map.
- Tennant Creek centre: OSM place=town node. Kakadu National Park centre: a point on land beside the Bowali pin (>=25 m from every spot), not a centroid.
