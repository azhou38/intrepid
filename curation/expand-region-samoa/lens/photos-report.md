# Samoa photos report

Applied 23 slots (second judge passed the first judge's pick). The brief said 27 verdicts; the judge-2 files hold 23 passes, 2 fails and 2 "none" (see below). Photos are in `assets/photos/` and pinned in `externalPhotos.json` to commit 80ac786c (full SHA); they 404 until the branch is pushed.

## Applied (Commons: WIKI_IMAGE_OVERRIDES / whyVisitPhotos; licences are read from the manifest)
- spot apia-1 Mount Vaea: Round Samoan houses ... Lepea village with Mt Vaea beyond.JPG (crop x.5 y.4 zoom1.4)
- spot apia-2 Robert Louis Stevenson Museum: The Samoan Home of Robert Louis Stevenson (30595201572).jpg; also dest:apia:why2 (shared, allowed)
- spot apia-4 Palolo Deep Marine Reserve: Coral scene on Palolo Deep Apia Samoa.jpg
- dest:savaii:header (Savaiʻi): South east coast Savai'i island - Samoa 2009.jpg (crop x.4 y.55 zoom1.3); removed "Savaiʻi" from NO_PHOTO
- dest:savaii:why2: Savai'i, Samoa banner 2.jpg (3:1; crop x.5 y.4, keyed File:...)
- savaii-1 Alofaaga Blowholes: Blowholes Savai'i 2009.jpg (x.5 y.4); savaii-2 Saleaula Lava Field: Sale'aula church ruin - panoramio - dbrough.jpg; savaii-6 Falealupo Rainforest Preserve: View Falealupo rainforest, Savai'i.JPG
- standalone: O Le Pupu Pu'e NP (aerial, IUCN BIOPAMA), Lake Lanoto'o NP (Lanoto'o Lake.jpg), Papapapai-tai Falls (Samoa waterfall scenery.jpg; x.62 y.45 zoom1.3), Piula Cave Pool, To Sua Ocean Trench, Lalomanu Beach, Namu'a Island (x.5 y.45 zoom1.6), Return to Paradise Beach

## Applied (external, assets/photos + externalPhotos.json)
- apia-5 Papase'ea Sliding Rocks: samoa.travel, official photo, used with permission (1920x700, x.65 y.5)
- savaii why1: samoa.travel Saleaula lava field, official photo, used with permission, key File:ext-dest-savaii-why1.jpg (1920x700)
- manono-island: samoa.travel islands header, official photo, used with permission (1920x721; crop set by me: x.47 y.4 zoom1.2, judges gave "ok" but the default 2.7:1 centre crop cut the island)
- apia-7 Immaculate Conception Cathedral, Apia: tmatic.travel, web photo, permission not confirmed (1600)
- savaii-4 Afu Aau Falls: world-of-waterfalls.com, web photo, permission not confirmed (1280). Two images of that page were candidates; I used Afu_Aau_Falls_030 (first listed), the judge named only the page. Check by eye.
- togitogiga-falls: mustseespots.com, web photo, permission not confirmed (1600)

## Not applied (empty)
- dest:apia:header: failed second judge. Apia stays in NO_PHOTO; not in HEADER_REVIEW_BACKLOG. Manifest build did NOT refuse. OWNER: needs a header.
- spot:savaii-7: failed second judge. OWNER: photo.
- dest:apia:why1 (snorkel Palolo Deep): second judge returned none because the first pick (Palolo coral, same file as apia-4) was not among that slot's candidates; left "". Reusing the apia-4 file is allowed and would likely pass: owner/next run call.
- spot:savaii-3 (Pulemelei): second judge none (first pick was a local 1024px file outside the candidate list); empty.
- first judge none: apia why3, apia-3 (Falemata'aga), apia-6 (Samoa Cultural Village), savaii-5 (Mt Matavanu), savaii why3 (Pulemelei, 1024 < 1280), and others with "none" in judge-1.

## Flags
- Photos still missing: Apia header, apia why1, why3, apia-3, apia-6, savaii-3, savaii-5, savaii-7, savaii why3, plus any spot with no judged slot.
- photo-prefilter: existing defaults fail for Apia header (WS-apia-regierg.jpg, no Commons metadata), Falemata'aga (same file), Mount Matavanu (dated 1906). Not slots I applied; they need new photos.
- Web photos with permission not confirmed: apia-7, savaii-4, togitogiga-falls.
- Brightness: the six new external photos measured above floor (p40 .25-.65). Commons slots: --keys run found 0 below floor, but 5 keys could not be measured (keys with commas/apostrophes); full run result below.
- build-image-manifest lists 22 pre-existing unrelated header size warnings.
- record-verdicts.ts not run (no task id supplied); not verified.
