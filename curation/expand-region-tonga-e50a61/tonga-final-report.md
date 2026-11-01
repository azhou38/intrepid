# Tonga run: final report

Branch `claude/expand-region-tonga-e50a61`, nothing pushed, nothing merged.

## Added
- New country: bounds, label point (Lifuka), popularity 24, facts, apply defaults (Pacific/Tongatapu, TOP), five regions.
- Destinations (approved): **Vavaʻu** (rank 2, 7 spots), **Tongatapu** (rank 3, 10 spots; spot ids start at `tongatapu-21`), **ʻEua** (`eua-island`, rank 4, 6 spots).
- Standalone spots (6): Tofua, Uoleva (Haʻapai); Niuafoʻou, Vai Lahi, Niuatoputapu, Tafahi (the Niuas).
- 130 candidates enumerated: 34 kept, 29 to review, 67 rejected.

## Left out or not added
- **Cathedral Cave** (ʻEua): no published price for the guided dive; a spot needs a cost. Unblocks with a sourced price.
- **ʻOtumatafena Tidal Pools** (ʻEua): no map feature, photo or price source for a pin. Unblocks with a point from the park's managers.
- **Mu'a**: dropped as a town wrapper of the Lapaha tombs.
- **Shirley Baker Grave** (Haʻapai), **Niuatoputapu White Sand Beaches**: kept by the script, sent to review by the blind judge.
- Coral Gardens (Vavaʻu snorkel site, from a guide blog) was never made a candidate.

## Review list (31, none added)
- Tongatapu (8): Tonga National Museum, Captain Cook Landing Site, Abel Tasman Landing Site, Fafa Island, ʻAtata Island, Malaʻe Kula, Basilica of St Anthony of Padua, Oholei Beach Dinner and Show.
- ʻEua (7): Coastal Walk, Matalanga ʻa Maui, ʻAna ʻAhu, Tufuvai Beach, Fangatave Beach, Ufilae Beach, Lokupo Lookout.
- Haʻapai (8): Pangai, Lotofoa Methodist Church, Poseidon's Gate, Foa Petroglyphs, ʻUiha, Kao, Luahoko Island, Shirley Baker Grave. Approving a few would take Haʻapai past four spots and make it a destination.
- Vavaʻu (5): Utakalongalu Market, Utulaʻaina Point Lookout, Toafa Church, Vavaʻu Pearl Centre, Ava Pulepulekai.
- Niuas (3): Hihifo Spring, Niuatoputapu Highest Point, Niuatoputapu White Sand Beaches.

## Added but weak
- Single-source or thin evidence: Lakufaʻanga Cliffs (bio rests on one supported line, overlaps Rock Gardens), Hunga Island, Uoleva, the Niuas and parts of ʻEua.
- Pins that are not precise visitor points (LOW or village/island nodes): Haʻaluma Beach (guidebook point), Hunga Island, Pangaimotu (Vavaʻu), Uoleva (resort node), Tofua (crater), Niuafoʻou (Angahā, moved after the audit put the first pin in the lake), Niuatoputapu.
- Audit flags kept as visitor points: Lapaha, Nukuʻalofa, Hufangalupe, Pangaimotu (Tongatapu), ʻEua National Park, ʻEneʻio, Tafahi (all 165 m to 3 km from a centroid); Mariners Cave and Vai Lahi are in water on purpose.
- Swallows Cave photo is a Commons file titled for the cave but taken from Kapa Island.

## Needs the owner
- Rank of Vavaʻu (2) and the other ranks; reuse of the destination id `tongatapu` (the unmerged tonga-test branch used `tongatapu-1…14`).
- The 31 review items above.
- **Push the branch**: the 24 non-Commons photos and the brightened Talamahu Market are pinned to commit SHAs that only exist locally; they will not load in the app until it is pushed.
- **Photos used with "permission not confirmed" (14)**: ʻEua header; Liʻangahuo ʻa Maui; Haʻaluma Beach; Tafahi; Tongatapu header and 2nd why-visit; Lapaha, Nukuʻalofa, ʻAnahulu Caves, Flying Fox Reserve; Vavaʻu why-visit 1, 2, 4; ʻEneʻio. Used with permission (official tourism/parks sites): ʻEua why-visit 1 and 2, Rock Gardens, Lakufaʻanga Cliffs, Big ʻOvava Tree, Tofua, Haʻatafu Beach, Vavaʻu header and why-visit 3, Mariners Cave.
- Tongatapu and Vavaʻu why-visit photos reused spot photos (allowed within a destination).
- Links blocked to scripts: none were; no `ticketUrl` exists for 28 of 29 spots (only anahulucave.to), because no official site was found; the Vavaʻu caves are sold by many operators and ʻEneʻio has no official site (lint `no-ticket`, recorded).

## Photos still missing (5 spot photos; every header and why-visit photo has one)
Shown with the designed placeholder (NO_PHOTO). Please supply a photo for each:
- Hunga Island (Vavaʻu): only real-estate and volcano hits.
- Pangaimotu (Vavaʻu): Commons files were the Tongatapu island.
- Niuafoʻou: only the crater-lake view, which went to Vai Lahi's candidate; the rest were stamps and maps.
- Niuatoputapu: orbital images, Tafahi views, an unidentified jetty.
- Vai Lahi: one Smithsonian crater-lake photo (1024 px, "permission not confirmed") exists but the judges could not confirm it shows the lake.
Tried: Commons by name and by location, Wikipedia lead images, Google Images, official tourism pages, searcher, in-app browser.

## Not verified
- Prices: ʻAnahulu TOP 20 and the Vavaʻu caves TOP 50 (Wikivoyage only), Hunga Island treated as free, ʻEneʻio NZ$110 (one booking page), Mt Talau free (one guide), ʻEua National Park free (not confirmed with the Forestry Division); Haʻamonga ʻa Maui, Talamahu Market, Flying Fox Reserve and Pangaimotu (Tongatapu) free by default.
- Whale season: sources disagree (June to November against July to October); copy says July to October.
- Map view on a phone or simulator was not checked; `photo-prefilter.ts` was not run over the whole app.
- Two image judges used a 2000 px header floor by mistake (real floor 1500); both were corrected. The neither second judge opened file pages, so a tiebreak judge did, an extra step not in the pipeline.
- Destination skeptic agent not run (its pre-screen only reads destinations already in the app); the orchestrator checked the spot bar, name test and rank by hand.
- OSM recall pass was incomplete in Tongatapu, Haʻapai and Vavaʻu (Overpass errors); ʻEua had no blind-audit sample.
